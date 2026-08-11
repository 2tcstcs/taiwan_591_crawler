import os
import sys
import json
import time
import random
import subprocess
import requests
import urllib3
import argparse
import re
import urllib.parse
import copy
from bs4 import BeautifulSoup

# Disable insecure request warnings from urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Target regions for real estate data
REGIONS = {
    1: '台北市',
    3: '新北市',
}

TAIPEI_DISTRICTS = ['中正區', '萬華區', '大同區', '中山區', '松山區', '大安區', '信義區', '內湖區', '南港區', '士林區', '北投區', '文山區']
NEW_TAIPEI_DISTRICTS = ['板橋區', '新莊區', '中和區', '永和區', '土城區', '樹林區', '三峽區', '鶯歌區', '三重區', '蘆洲區', '五股區', '泰山區', '林口區', '八里區', '淡水區', '三芝區', '石門區', '金山區', '萬里區', '汐止區', '深坑區', '石碇區', '瑞芳區', '平溪區', '雙溪區', '貢寮區', '坪林區', '烏來區', '新店區']

def get_section(address, region):
    districts = TAIPEI_DISTRICTS if region == '台北市' else NEW_TAIPEI_DISTRICTS
    for dist in districts:
        if dist in address:
            return dist
    return ''

def normalize_type(raw_type):
    if not raw_type:
        return '住宅'
    raw_type = str(raw_type)
    if '大樓' in raw_type or '華廈' in raw_type:
        return '電梯大樓'
    elif '公寓' in raw_type:
        return '公寓'
    elif '別墅' in raw_type or '透天' in raw_type:
        return '別墅'
    return '住宅'

def is_within_one_day(item):
    # Check posttime (unix timestamp)
    post_time = item.get('posttime')
    if post_time:
        try:
            # 1 day = 86400 seconds
            if time.time() - float(post_time) <= 86400:
                return True
        except (ValueError, TypeError):
            pass
            
    # Check refreshtime string (e.g., "3分鐘前", "2小時前", "今天", "1天前")
    ref_time = item.get('refreshtime')
    if ref_time and isinstance(ref_time, str):
        ref_time_lower = ref_time.lower()
        if "分鐘" in ref_time_lower or "小時" in ref_time_lower or "今天" in ref_time_lower or "1天前" in ref_time_lower or "秒前" in ref_time_lower:
            return True
            
    return False

def crawl_page(region_id, first_row):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    }
    
    # 591 relies heavily on the 'urlJumpIp' cookie to server-side render the selected region
    cookies = {
        'urlJumpIp': str(region_id),
        'webp': '1',
    }
    
    url = f'https://sale.591.com.tw/?regionid={region_id}&firstRow={first_row}&shType=list'
    print(f"Fetching 591: {url}")
    
    try:
        r = requests.get(url, headers=headers, cookies=cookies, verify=False, timeout=15)
        if r.status_code != 200:
            print(f"Error fetching page (status {r.status_code})")
            return None
        return r.text
    except Exception as e:
        print(f"Network error occurred: {e}")
        return None

def crawl_sinyi(pages, region_name):
    region_slug = 'Taipei-city' if region_name == '台北市' else 'NewTaipei-city'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    }
    
    houses = []
    for page in range(1, pages + 1):
        if page == 1:
            url = f"https://www.sinyi.com.tw/buy/list/{region_slug}/"
        else:
            url = f"https://www.sinyi.com.tw/buy/list/{region_slug}/{page}"
            
        print(f"Fetching Sinyi: {url}")
        try:
            r = requests.get(url, headers=headers, verify=False, timeout=15)
            if r.status_code != 200:
                print(f"Sinyi error status code {r.status_code}")
                continue
                
            soup = BeautifulSoup(r.text, 'html.parser')
            
            # Parse Sinyi coordinates mapping from __NEXT_DATA__
            coord_map = {}
            next_data_match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', r.text, re.DOTALL)
            if next_data_match:
                try:
                    next_json = json.loads(next_data_match.group(1))
                    state = next_json.get("props", {}).get("initialReduxState", {})
                    buy_list = state.get("buyReducer", {}).get("list", [])
                    for item_data in buy_list:
                        h_no = item_data.get("houseNo")
                        h_lat = item_data.get("latitude")
                        h_lng = item_data.get("longitude")
                        if h_no and h_lat and h_lng:
                            coord_map[h_no] = (float(h_lat), float(h_lng))
                except Exception as e:
                    print(f"Sinyi NEXT_DATA parsing error: {e}")

            items = soup.find_all("div", class_="buy-list-item")
            print(f"Parsed {len(items)} items from Sinyi page {page}")
            
            for item in items:
                # Link & ID
                a_tag = item.find("a")
                href = a_tag["href"] if a_tag else ""
                if not href:
                    continue
                parts = href.split("/")
                if len(parts) <= 3:
                    continue
                house_id = parts[3].split("?")[0]
                detail_url = "https://www.sinyi.com.tw" + href
                
                # Title
                title_div = item.find(class_=re.compile("Type_Name"))
                title = title_div.get_text(strip=True) if title_div else "無標題"
                
                # Address & Type & Age
                addr_div = item.find(class_=re.compile("Type_Address"))
                address = ""
                raw_type = "住宅"
                age = 0.0
                if addr_div:
                    spans = addr_div.find_all("span")
                    if len(spans) > 0:
                        address = spans[0].get_text(strip=True)
                    if len(spans) > 1:
                        val2 = spans[1].get_text(strip=True)
                        if "年" in val2:
                            try:
                                age = float(val2.replace("年", ""))
                            except:
                                age = 0.0
                        elif val2 == "預售":
                            age = 0.0
                    if len(spans) > 2:
                        raw_type = spans[2].get_text(strip=True)
                
                # Prepend region if missing
                if region_name not in address:
                    address = region_name + address
                    
                section = get_section(address, region_name)
                
                # House Info (Area, Rooms)
                info_div = item.find(class_=re.compile("Type_HouseInfo"))
                area = 0.0
                rooms = ""
                if info_div:
                    info_text = info_div.get_text(" • ", strip=True)
                    area_match = re.search(r'建坪\s*•?\s*([\d\.]+)', info_text)
                    if area_match:
                        area = float(area_match.group(1))
                    room_match = re.search(r'(\d+房\d+廳\d+衛)', info_text)
                    if room_match:
                        rooms = room_match.group(1)
                
                # Price
                right_div = item.find(class_=re.compile("Type_Right"))
                price_val = 0.0
                if right_div:
                    main_price_span = right_div.find(lambda tag: tag.name == "span" and tag.get("style") and ("#dd2525" in tag.get("style") or "color:rgb(221, 37, 37)" in tag.get("style")))
                    if not main_price_span:
                        main_price_span = right_div.find(lambda tag: tag.name == "span" and tag.get("style") and "font-size" in tag.get("style") and "line-through" not in tag.get("style"))
                    
                    if main_price_span:
                        price_text = main_price_span.get_text(strip=True).replace(",", "")
                        try:
                            price_val = float(price_text)
                        except:
                            price_val = 0.0
                
                # Unit Price calculation
                unit_price = ""
                if area > 0:
                    unit_price = f"{round(price_val / area, 2)}萬/坪"
                    
                # Image
                img_wrapper = item.find(class_=re.compile("Images"))
                photo = ""
                if img_wrapper:
                    img = img_wrapper.find("img")
                    if img and img.get("src") and "smallimg" in img.get("src"):
                        photo = img.get("src")
                    else:
                        style = img_wrapper.find("div", class_=re.compile("largeImg"))
                        if style and style.get("style") and "url(" in style.get("style"):
                            bg_match = re.search(r'url\((.*?)\)', style.get("style"))
                            if bg_match:
                                photo = bg_match.group(1).strip("'\"")
                
                lat, lng = coord_map.get(house_id, (0.0, 0.0))

                house_data = {
                    'id': f"sinyi_{house_id}",
                    'title': title,
                    'price': price_val,
                    'unit_price': unit_price,
                    'area': area,
                    'room': rooms,
                    'region': region_name,
                    'section': section,
                    'community': "",
                    'type': normalize_type(raw_type),
                    'age': int(age) if age.is_integer() else age,
                    'address': address,
                    'photo': photo,
                    'url': detail_url,
                    'posttime': int(time.time()),
                    'refreshtime': "剛剛",
                    'last_seen': int(time.time()),
                    'source': 'sinyi',
                    'latitude': lat,
                    'longitude': lng,
                    'purpose': 'sale'
                }
                houses.append(house_data)
                
            delay = random.uniform(2.0, 4.0)
            print(f"Waiting {delay:.2f} seconds...")
            time.sleep(delay)
        except Exception as e:
            print(f"Error crawling Sinyi page {page}: {e}")
            
    return houses

def crawl_yungching(pages, region_name):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    }
    quoted_region = urllib.parse.quote(region_name)
    
    houses = []
    for page in range(1, pages + 1):
        url = f"https://buy.yungching.com.tw/region/{quoted_region}-_c?pg={page}"
        print(f"Fetching Yungching: {url}")
        try:
            r = requests.get(url, headers=headers, verify=False, timeout=15)
            if r.status_code != 200:
                print(f"Yungching error status code {r.status_code}")
                continue
                
            soup = BeautifulSoup(r.text, 'html.parser')
            items = soup.find_all("li", class_="search-result-list-item")
            print(f"Parsed {len(items)} items from Yungching page {page}")
            
            for item in items:
                # Link & ID
                a_tag = item.find("a", class_="link")
                href = a_tag["href"] if a_tag else ""
                if not href:
                    continue
                house_id = href.split("/")[-1]
                detail_url = "https://buy.yungching.com.tw/" + href
                
                # Title
                title_div = item.find(class_="caseName")
                title = title_div.get_text(strip=True) if title_div else ""
                if not title:
                    img = item.find("img")
                    title = img.get("alt") if img and img.get("alt") else "無標題"
                    
                # Address & Community
                addr_div = item.find(class_="address-wrapper")
                address = ""
                community = ""
                if addr_div:
                    addr_span = addr_div.find(class_="address")
                    if addr_span:
                        address = addr_span.get_text(strip=True)
                    comm_span = addr_div.find(class_="community")
                    if comm_span:
                        community = comm_span.get_text(strip=True)
                
                if region_name not in address:
                    address = region_name + address
                    
                section = get_section(address, region_name)
                
                # Case info: type, age, area, room count
                info_div = item.find(class_="case-info")
                raw_type = "住宅"
                age = 0.0
                area = 0.0
                rooms = ""
                if info_div:
                    type_span = info_div.find(class_="caseType")
                    if type_span:
                        raw_type = type_span.get_text(strip=True)
                        
                    age_span = info_div.find(lambda tag: tag.name == "span" and "年" in tag.string) if info_div else None
                    if age_span:
                        age_text = age_span.get_text(strip=True).replace("年", "")
                        if age_text and age_text != "--":
                            try:
                                age = float(age_text)
                            except:
                                age = 0.0
                                
                    area_span = info_div.find(class_="regArea")
                    if area_span:
                        area_text = area_span.get_text(strip=True).replace("建坪", "")
                        try:
                            area = float(area_text)
                        except:
                            area = 0.0
                            
                    room_span = info_div.find(class_="room")
                    if room_span:
                        rooms = room_span.get_text(strip=True)
                
                # Price
                price_div = item.find(class_="price")
                price_val = 0.0
                if price_div:
                    price_text = price_div.get_text(strip=True).replace(",", "")
                    try:
                        price_val = float(price_text)
                    except:
                        price_val = 0.0
                
                # Unit Price calculation
                unit_price = ""
                if area > 0:
                    unit_price = f"{round(price_val / area, 2)}萬/坪"
                    
                # Image
                img_tag = item.find("img")
                photo = img_tag.get("src") if img_tag else ""
                
                house_data = {
                    'id': f"yungching_{house_id}",
                    'title': title,
                    'price': price_val,
                    'unit_price': unit_price,
                    'area': area,
                    'room': rooms,
                    'region': region_name,
                    'section': section,
                    'community': community,
                    'type': normalize_type(raw_type),
                    'age': int(age) if age.is_integer() else age,
                    'address': address,
                    'photo': photo,
                    'url': detail_url,
                    'posttime': int(time.time()),
                    'refreshtime': "剛剛",
                    'last_seen': int(time.time()),
                    'source': 'yungching',
                    'latitude': 0.0,
                    'longitude': 0.0,
                    'purpose': 'sale'
                }
                houses.append(house_data)
                
            delay = random.uniform(2.0, 4.0)
            print(f"Waiting {delay:.2f} seconds...")
            time.sleep(delay)
        except Exception as e:
            print(f"Error crawling Yungching page {page}: {e}")
            
    return houses

def is_within_30_days(refresh_time_str):
    if not refresh_time_str:
        return True
    refresh_time_str = str(refresh_time_str).strip()
    
    # Sinyi format: "2026/06/16 11:47"
    if '/' in refresh_time_str:
        try:
            date_part = refresh_time_str.split()[0]
            parts = date_part.split('/')
            if len(parts) == 3:
                y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
                import datetime
                dt = datetime.datetime(y, m, d)
                diff = datetime.datetime.now() - dt
                return diff.days <= 30
        except Exception as e:
            print(f"Error parsing Sinyi rent date {refresh_time_str}: {e}")
            return True
            
    # 591 relative format: "17天前更新", "剛剛", etc.
    refresh_lower = refresh_time_str.lower()
    if any(k in refresh_lower for k in ['剛剛', '秒', '分鐘', '小時', '今天', '昨天', '1天前']):
        return True
        
    day_match = re.search(r'(\d+)\s*天', refresh_lower)
    if day_match:
        days = int(day_match.group(1))
        return days <= 30
        
    month_match = re.search(r'(\d+)\s*個月', refresh_lower)
    if month_match:
        months = int(month_match.group(1))
        return months <= 1
        
    if '年' in refresh_lower:
        return False
        
    return True

def crawl_rent_591(pages):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    }
    cookies = {
        'urlJumpIp': '1',
        'webp': '1',
    }
    
    temp_html = 'temp_rent_page.html'
    temp_json = 'temp_rent_parsed.json'
    houses = []
    
    for page in range(pages):
        first_row = page * 30
        url = f'https://rent.591.com.tw/?region=1&firstRow={first_row}'
        print(f"Fetching 591 Rent: {url}")
        
        try:
            r = requests.get(url, headers=headers, cookies=cookies, verify=False, timeout=15)
            if r.status_code != 200:
                print(f"Error fetching page (status {r.status_code})")
                continue
                
            with open(temp_html, 'w', encoding='utf-8') as f:
                f.write(r.text)
                
            res = subprocess.run(
                ['node', 'nuxt_parser.js', temp_html, temp_json],
                capture_output=True,
                text=True,
                check=False
            )
            if res.returncode != 0:
                print(f"Nuxt parser error: {res.stderr}")
                continue
                
            if not os.path.exists(temp_json):
                continue
                
            with open(temp_json, 'r', encoding='utf-8') as f:
                listings = json.load(f)
                
            print(f"Parsed {len(listings)} items from 591 Rent page {page+1}")
            
            for item in listings:
                house_id = item.get('id')
                if not house_id:
                    continue
                    
                ref_time = item.get('refresh_time') or ''
                if not is_within_30_days(ref_time):
                    continue
                    
                price_str = str(item.get('price') or '0').replace(',', '')
                try:
                    price_val = float(price_str)
                except ValueError:
                    price_val = 0.0
                    
                area_val = item.get('area') or 0.0
                try:
                    area_num = float(area_val)
                except (ValueError, TypeError):
                    area_num = 0.0
                    
                unit_price = ""
                if area_num > 0:
                    unit_price = f"{round(price_val / area_num, 1)}元/坪"
                    
                photo = item.get('cover') or ''
                if not photo and item.get('photoList'):
                    photo = item.get('photoList')[0]
                    
                addr_text = item.get('address') or ''
                addr_parts = addr_text.split('-')
                section = addr_parts[0] if addr_parts else ''
                if not section.endswith('區'):
                    section = get_section(addr_text, '台北市')
                    
                raw_type = item.get('ding_kind_alias_name') or item.get('kind_name') or '住宅'
                
                house_data = {
                    'id': f"591_{house_id}",
                    'title': item.get('title') or '無標題',
                    'price': price_val,
                    'unit_price': unit_price,
                    'area': area_num,
                    'room': item.get('layoutStr') or item.get('kind_name') or '',
                    'region': '台北市',
                    'section': section,
                    'community': item.get('community_name') or '',
                    'type': normalize_type(raw_type),
                    'age': 0.0,
                    'address': addr_text,
                    'photo': photo,
                    'url': item.get('url') or f"https://rent.591.com.tw/{house_id}",
                    'posttime': int(time.time()),
                    'refreshtime': ref_time,
                    'last_seen': int(time.time()),
                    'source': '591',
                    'latitude': 0.0,
                    'longitude': 0.0,
                    'purpose': 'rent'
                }
                houses.append(house_data)
                
            delay = random.uniform(2.0, 4.0)
            print(f"Waiting {delay:.2f} seconds...")
            time.sleep(delay)
            
        except Exception as e:
            print(f"Error crawling 591 Rent page {page+1}: {e}")
            
    for path in [temp_html, temp_json]:
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass
                
    return houses

def crawl_rent_sinyi(pages):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    }
    
    houses = []
    
    for page in range(1, pages + 1):
        if page == 1:
            url = "https://www.sinyi.com.tw/rent/list/taipei-city/"
        else:
            url = f"https://www.sinyi.com.tw/rent/list/taipei-city/{page}"
            
        print(f"Fetching Sinyi Rent: {url}")
        try:
            r = requests.get(url, headers=headers, verify=False, timeout=15)
            if r.status_code != 200:
                print(f"Sinyi Rent error status {r.status_code}")
                continue
                
            soup = BeautifulSoup(r.text, 'html.parser')
            items = soup.find_all("div", class_="search_result_item")
            print(f"Parsed {len(items)} items from Sinyi Rent page {page}")
            
            for item in items:
                id_attr = item.get('id')
                if not id_attr:
                    continue
                house_id = id_attr.replace('search_result_', '')
                
                a_tag = item.find('a')
                href = a_tag.get('href') if a_tag else ''
                if not href:
                    continue
                detail_url = "https://rent.sinyi.com.tw/" + href
                
                title_span = item.find(class_='item_title')
                title = title_span.get_text(strip=True) if title_span else "無標題"
                
                price_span = item.find(class_='price_new')
                price_val = 0.0
                if price_span:
                    num_span = price_span.find(class_='num')
                    if num_span:
                        price_text = num_span.get_text(strip=True).replace(',', '')
                        try:
                            price_val = float(price_text)
                        except ValueError:
                            price_val = 0.0
                            
                addr_span = item.find(class_='num-text')
                address = addr_span.get_text(strip=True) if addr_span else ""
                
                if '台北市' not in address:
                    continue
                    
                section = get_section(address, '台北市')
                
                date_span = item.find(class_='gray-date-1')
                ref_time = date_span.get_text(strip=True) if date_span else '剛剛'
                
                if not is_within_30_days(ref_time):
                    continue
                    
                area = 0.0
                rooms = ""
                line2 = item.find(class_='detail_line2')
                if line2:
                    for span in line2.find_all('span'):
                        span_text = span.get_text()
                        if '坪' in span_text:
                            num_span = span.find(class_='num')
                            if num_span:
                                try:
                                    area = float(num_span.get_text(strip=True))
                                except ValueError:
                                    area = 0.0
                        elif '房' in span_text:
                            num_span = span.find(class_='num')
                            if num_span:
                                rooms = num_span.get_text(strip=True)
                                
                unit_price = ""
                if area > 0:
                    unit_price = f"{round(price_val / area, 1)}元/坪"
                    
                img_tag = item.find('img')
                photo = img_tag.get('src') if img_tag else ''
                
                house_data = {
                    'id': f"sinyi_{house_id}",
                    'title': title,
                    'price': price_val,
                    'unit_price': unit_price,
                    'area': area,
                    'room': rooms,
                    'region': '台北市',
                    'section': section,
                    'community': "",
                    'type': '住宅',
                    'age': 0.0,
                    'address': address,
                    'photo': photo,
                    'url': detail_url,
                    'posttime': int(time.time()),
                    'refreshtime': ref_time,
                    'last_seen': int(time.time()),
                    'source': 'sinyi',
                    'latitude': 0.0,
                    'longitude': 0.0,
                    'purpose': 'rent'
                }
                houses.append(house_data)
                
            delay = random.uniform(2.0, 4.0)
            print(f"Waiting {delay:.2f} seconds...")
            time.sleep(delay)
        except Exception as e:
            print(f"Error crawling Sinyi Rent page {page}: {e}")
            
    return houses


def load_config():
    config_path = 'config.json'
    example_path = 'config.example.json'
    
    # If config.json doesn't exist, copy from config.example.json or create a default one
    if not os.path.exists(config_path):
        if os.path.exists(example_path):
            print(f"Creating {config_path} from {example_path}...")
            try:
                import shutil
                shutil.copy(example_path, config_path)
            except Exception as e:
                print(f"Error copying config template: {e}")
        else:
            default_config = {
                "line_channel_access_token": "",
                "line_user_id": "",
                "notification_rules": {
                    "purpose": "rent",
                    "price_min": None,
                    "price_max": None,
                    "region": "台北市",
                    "sections": [],
                    "types": [],
                    "rooms": []
                }
            }
            try:
                with open(config_path, 'w', encoding='utf-8') as f:
                    json.dump(default_config, f, indent=2, ensure_ascii=False)
            except Exception as e:
                print(f"Error creating default config.json: {e}")
                
    data = {}
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if "line_notify_token" in data:
                    print("⚠️ 偵測到舊版設定欄位 'line_notify_token'。請注意 LINE Notify 已結束服務，請至 LINE Developers 建立 Bot，並改用 'line_channel_access_token' 與 'line_user_id'。")
        except Exception as e:
            print(f"Error loading config.json: {e}")
            
    # Environment variables override (very useful for GitHub Actions secrets)
    env_token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
    env_user_id = os.environ.get("LINE_USER_ID")
    env_rules = os.environ.get("LINE_NOTIFICATION_RULES")
    
    if env_token:
        data["line_channel_access_token"] = env_token
    if env_user_id:
        data["line_user_id"] = env_user_id
    if env_rules:
        try:
            data["notification_rules"] = json.loads(env_rules)
            print("Loaded notification rules from environment variable LINE_NOTIFICATION_RULES.")
        except Exception as e:
            print(f"Error parsing LINE_NOTIFICATION_RULES env variable: {e}")
            
    return data


def send_line_notification(token, user_id, message, image_url=None):
    if not token or not user_id:
        print("LINE Channel Access Token or User ID is empty, skipping notification.")
        return False
        
    url = "https://api.line.me/v2/bot/message/push"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    
    # Text message block
    messages = [
        {
            "type": "text",
            "text": message
        }
    ]
    
    # Add image preview message block if URL is valid HTTPS
    if image_url and image_url.startswith('https://'):
        messages.append({
            "type": "image",
            "originalContentUrl": image_url,
            "previewImageUrl": image_url
        })
        
        payload = {
            "to": user_id,
            "messages": messages
        }
        
        try:
            print(f"Sending LINE Message with image: {image_url}")
            r = requests.post(url, headers=headers, json=payload, timeout=10)
            if r.status_code == 200:
                print("LINE Message sent successfully (text + image).")
                return True
            else:
                print(f"LINE Message with image failed (status {r.status_code}): {r.text}. Retrying with text only...")
        except Exception as e:
            print(f"Error sending LINE Message with image: {e}. Retrying with text only...")
            
    # Fallback to text only
    payload = {
        "to": user_id,
        "messages": [
            {
                "type": "text",
                "text": message
            }
        ]
    }
    try:
        r = requests.post(url, headers=headers, json=payload, timeout=10)
        if r.status_code == 200:
            print("LINE Message sent successfully (text only).")
            return True
        else:
            print(f"LINE Message failed (status {r.status_code}): {r.text}")
            return False
    except Exception as e:
        print(f"Error sending LINE Message: {e}")
        return False


def matches_rules(house_data, rules):
    if not rules:
        return True
        
    rule_purpose = rules.get('purpose')
    if rule_purpose and rule_purpose != 'all':
        if house_data.get('purpose') != rule_purpose:
            return False
            
    price = house_data.get('price', 0)
    price_min = rules.get('price_min')
    price_max = rules.get('price_max')
    if price_min is not None:
        if price < price_min:
            return False
    if price_max is not None:
        if price > price_max:
            return False
            
    rule_region = rules.get('region')
    if rule_region:
        if house_data.get('region') != rule_region:
            return False
            
    rule_sections = rules.get('sections')
    if rule_sections:
        if house_data.get('section') not in rule_sections:
            return False
            
    rule_types = rules.get('types')
    if rule_types:
        if house_data.get('type') not in rule_types:
            return False
            
    rule_rooms = rules.get('rooms')
    if rule_rooms:
        house_room = house_data.get('room', '')
        if not any(r in house_room for r in rule_rooms):
            return False
            
    return True


def check_and_notify_house(house_data, original_houses, config, skip_notifications=False):
    rules = config.get("notification_rules", {})
    if not matches_rules(house_data, rules):
        return False
        
    house_id = house_data["id"]
    is_new = house_id not in original_houses
    is_price_drop = False
    old_price = None
    
    if not is_new:
        old_price = original_houses[house_id].get("price")
        if old_price is not None and house_data["price"] < old_price:
            is_price_drop = True
            
    if not is_new and not is_price_drop:
        return False
        
    if skip_notifications:
        print(f"匹配房源 (未發送通知，初始化中): {house_data['title']} ({house_data['price']})")
        return False
        
    token = config.get("line_channel_access_token")
    user_id = config.get("line_user_id")
    if not token or not user_id:
        return False
        
    purpose = house_data.get("purpose", "sale")
    price_unit = "元/月" if purpose == "rent" else "萬 TWD"
    
    title_prefix = "🔔 【新房源上架通知】" if is_new else "📉 【價格變動降價通知】"
    
    if is_price_drop:
        price_str = f"{old_price:,.0f} {price_unit} ➔ {house_data['price']:,.0f} {price_unit} (降價 {(old_price - house_data['price']):,.0f}!)"
    else:
        price_str = f"{house_data['price']:,.0f} {price_unit}"
        
    unit_price = house_data.get("unit_price")
    if unit_price:
        price_str += f" ({unit_price})"
        
    source_name = {
        "591": "線上平台",
        "sinyi": "信義房屋",
        "yungching": "永慶房屋"
    }.get(house_data.get("source"), house_data.get("source"))
    
    message = (
        f"{title_prefix}\n"
        f"==================\n"
        f"🏠 標題：{house_data.get('title', '無標題')}\n"
        f"💰 價格：{price_str}\n"
        f"📏 建坪：{house_data.get('area', 0.0)} 坪\n"
        f"🛏 格局：{house_data.get('room', '無')}\n"
        f"🏢 類型：{house_data.get('type', '未知')}\n"
        f"📍 地址：{house_data.get('address', '未知')}\n"
        f"🔍 來源：{source_name}\n"
        f"🔗 詳情連結：{house_data.get('url', '')}"
    )
    
    photo_url = house_data.get("photo")
    if photo_url and not photo_url.startswith('https://'):
        if photo_url.startswith('http://'):
            photo_url = photo_url.replace('http://', 'https://')
        else:
            photo_url = None
            
    success = send_line_notification(token, user_id, message, photo_url)
    return success


def main():
    parser = argparse.ArgumentParser(description="多房仲平台售屋爬蟲與自動更新")
    parser.add_argument('--pages', type=int, default=5, help='每個區域要爬取的頁數')
    parser.add_argument('--init', action='store_true', help='初始爬取，僅篩選保留 1 天（24小時）內發布或更新的房源')
    parser.add_argument('--test-notify', action='store_true', help='測試 LINE Notify 連線與權杖是否正確')
    args = parser.parse_args()

    config = load_config()

    if args.test_notify:
        token = config.get("line_channel_access_token")
        user_id = config.get("line_user_id")
        if not token or not user_id:
            print("錯誤：尚未在 config.json 中設定 line_channel_access_token 或 line_user_id。")
            sys.exit(1)
        print("正在發送測試 LINE Message 通知...")
        success = send_line_notification(
            token,
            user_id,
            "🔔 【觀測站 LINE 通知測試成功】\n"
            "這是一封手動觸發的測試推播訊息，代表您的 LINE Messaging API 憑證設定正確！"
        )
        if success:
            print("測試通知發送成功！請檢查您的 LINE 聊天室。")
            sys.exit(0)
        else:
            print("測試通知發送失敗，請檢查權杖與用戶 ID 是否正確。")
            sys.exit(1)

    all_houses = {}
    original_houses = {}
    
    # 載入現有資料庫（非 --init 模式）
    if not args.init:
        if os.path.exists('data.json'):
            try:
                with open('data.json', 'r', encoding='utf-8') as f:
                    existing_data = json.load(f)
                    for item in existing_data:
                        # 確保具備 last_seen，預設為現在
                        if 'last_seen' not in item:
                            item['last_seen'] = int(time.time())
                        if 'source' not in item:
                            item['source'] = '591'
                        if 'latitude' not in item:
                            item['latitude'] = 0.0
                        if 'longitude' not in item:
                            item['longitude'] = 0.0
                        if 'purpose' not in item:
                            item['purpose'] = 'sale'
                        hid_str = str(item['id'])
                        if not any(hid_str.startswith(p) for p in ['591_', 'yungching_', 'sinyi_']):
                            item['id'] = f"591_{hid_str}"
                            hid_str = item['id']
                        all_houses[hid_str] = item
                original_houses = copy.deepcopy(all_houses)
                print(f"成功載入 {len(all_houses)} 筆現有房源資料。")
            except Exception as e:
                print(f"載入 data.json 失敗: {e}")
    else:
        print("初始化模式：將清除舊有資料並僅保留 24 小時內之新上架與更新房源。")

    # 驗證 Node.js 是否可用
    try:
        subprocess.run(['node', '-v'], capture_output=True, check=True)
    except Exception:
        print("錯誤：Node.js 是執行 Nuxt 網頁解析器所必需的。請先安裝 Node.js。")
        sys.exit(1)
        
    temp_html = 'temp_page.html'
    temp_json = 'temp_parsed.json'
    
    try:
        for region_id, region_name in REGIONS.items():
            print(f"\n=== 開始爬取 591 區域: {region_name} (ID: {region_id}) ===")
            for page in range(args.pages):
                first_row = page * 30
                print(f"第 {page+1} 頁 (firstRow={first_row})...")
                
                # 取得頁面 HTML
                html_content = crawl_page(region_id, first_row)
                if not html_content:
                    print("抓取網頁失敗，跳過此頁。")
                    continue
                    
                # 寫入暫存檔案
                with open(temp_html, 'w', encoding='utf-8') as f:
                    f.write(html_content)
                    
                # 呼叫 Node.js 解析
                try:
                    res = subprocess.run(
                        ['node', 'nuxt_parser.js', temp_html, temp_json],
                        capture_output=True,
                        text=True,
                        check=False
                    )
                    if res.returncode != 0:
                        print(f"解析器錯誤輸出: {res.stderr}")
                        continue
                except Exception as e:
                    print(f"無法執行 Node 解析器: {e}")
                    continue
                    
                # 載入解析後的 JSON
                if not os.path.exists(temp_json):
                    print("解析器未輸出暫存 JSON 檔案。")
                    continue
                    
                with open(temp_json, 'r', encoding='utf-8') as f:
                    listings = json.load(f)
                    
                print(f"成功解析出 {len(listings)} 筆物件。")
                
                added_in_page = 0
                for item in listings:
                    house_id = item.get('houseid') or item.get('id')
                    if not house_id:
                        continue
                        
                    # 如果是初始化模式，只保留 24 小時內的物件
                    if args.init and not is_within_one_day(item):
                        continue
                        
                    # 正規化總價
                    price_val = item.get('price')
                    try:
                        if isinstance(price_val, str):
                            cleaned_price = ''.join(c for c in price_val if c.isdigit() or c == '.')
                            price_num = float(cleaned_price)
                        else:
                            price_num = float(price_val)
                    except (ValueError, TypeError):
                        price_num = 0.0
                        
                    # 正規化屋齡
                    age_val = item.get('houseage') or item.get('showhouseage') or 0
                    try:
                        if isinstance(age_val, str):
                            cleaned_age = ''.join(c for c in age_val if c.isdigit())
                            age_num = int(cleaned_age) if cleaned_age else 0
                        else:
                            age_num = int(age_val)
                    except (ValueError, TypeError):
                        age_num = 0

                    # 正規化建坪
                    area_val = item.get('area') or 0.0
                    try:
                        area_num = float(area_val)
                    except (ValueError, TypeError):
                        area_num = 0.0
                        
                    # 取得圖片連結
                    photo = item.get('photo_url')
                    if not photo:
                        cover = item.get('cover')
                        if isinstance(cover, dict):
                            photo = cover.get('src')
                    
                    house_data = {
                        'id': f"591_{house_id}",
                        'title': item.get('title') or item.get('name') or '無標題',
                        'price': price_num,  # 單位：萬 TWD
                        'unit_price': item.get('unit_price') or item.get('unitprice') or '',
                        'area': area_num,     # 單位：坪
                        'room': item.get('room') or '',
                        'region': item.get('region_name') or region_name,
                        'section': item.get('section_name') or '',
                        'community': item.get('community_name') or '',
                        'type': normalize_type(item.get('shape_name') or item.get('housetype') or '住宅'),
                        'age': age_num,       # 單位：年
                        'address': item.get('address') or '',
                        'photo': photo or '',
                        'url': f'https://sale.591.com.tw/home/house/detail/2/{house_id}.html',
                        'posttime': item.get('posttime'),
                        'refreshtime': item.get('refreshtime'),
                        'last_seen': int(time.time()),
                        'source': '591',
                        'latitude': 0.0,
                        'longitude': 0.0,
                        'purpose': 'sale'
                    }
                    
                    all_houses[house_data['id']] = house_data
                    added_in_page += 1
                
                print(f"本頁儲存/更新了 {added_in_page} 筆物件。")
                    
                # 延遲以防被鎖 IP
                delay = random.uniform(2.0, 5.0)
                print(f"等待 {delay:.2f} 秒...")
                time.sleep(delay)
                
    finally:
        # 清理暫存檔案
        for fpath in [temp_html, temp_json]:
            if os.path.exists(fpath):
                try:
                    os.remove(fpath)
                except Exception:
                    pass

    # Now crawl Sinyi
    print("\n==========================================")
    print("=== 開始爬取信義房屋 ===")
    print("==========================================")
    for region_id, region_name in REGIONS.items():
        try:
            sinyi_listings = crawl_sinyi(args.pages, region_name)
            for item in sinyi_listings:
                all_houses[item['id']] = item
        except Exception as e:
            print(f"爬取信義房屋出錯 ({region_name}): {e}")
            
    # Now crawl Yungching
    print("\n==========================================")
    print("=== 開始爬取永慶房屋 ===")
    print("==========================================")
    for region_id, region_name in REGIONS.items():
        try:
            yungching_listings = crawl_yungching(args.pages, region_name)
            for item in yungching_listings:
                all_houses[item['id']] = item
        except Exception as e:
            print(f"爬取永慶房屋出錯 ({region_name}): {e}")
            
    # Now crawl 591 Rent
    print("\n==========================================")
    print("=== 開始爬取 591 租屋 ===")
    print("==========================================")
    try:
        rent_591_listings = crawl_rent_591(args.pages)
        for item in rent_591_listings:
            all_houses[item['id']] = item
    except Exception as e:
        print(f"爬取 591 租屋出錯: {e}")

    # Now crawl Sinyi Rent
    print("\n==========================================")
    print("=== 開始爬取信義房屋租屋 ===")
    print("==========================================")
    try:
        rent_sinyi_listings = crawl_rent_sinyi(args.pages)
        for item in rent_sinyi_listings:
            all_houses[item['id']] = item
    except Exception as e:
        print(f"爬取信義房屋租屋出錯: {e}")
                
    # 自動清除超過 7 天（604800 秒）未被再次看到的房源物件
    now = int(time.time())
    filtered_houses = {}
    for hid, hdata in all_houses.items():
        if now - hdata.get('last_seen', now) <= 604800:
            filtered_houses[hid] = hdata
            
    removed_count = len(all_houses) - len(filtered_houses)
    if removed_count > 0:
        print(f"\n已自動清理 {removed_count} 筆超過 7 天未更新之過期物件。")
    all_houses = filtered_houses

    # 執行 LINE 通知篩選與推播
    skip_notifications = (len(original_houses) == 0) or args.init
    if skip_notifications:
        print("\n[LINE 通知] 初始化或無歷史資料，此執行批次將不發送 LINE 通知以防洗版。")
        
    notification_count = 0
    for hid, hdata in all_houses.items():
        # 檢查該物件是否為新上架或降價物件
        is_new = hid not in original_houses
        is_price_drop = False
        if not is_new:
            old_price = original_houses[hid].get("price")
            if old_price is not None and hdata["price"] < old_price:
                is_price_drop = True
                
        if is_new or is_price_drop:
            # 檢查是否符合篩選規則
            if matches_rules(hdata, config.get("notification_rules", {})):
                if not skip_notifications:
                    if notification_count >= 10:
                        print("\n[LINE 通知] 已達到單次執行最大通知筆數限制 (10 筆)，後續通知已忽略。")
                        break
                    
                    if check_and_notify_house(hdata, original_houses, config, skip_notifications=False):
                        notification_count += 1
                        time.sleep(1)
                else:
                    check_and_notify_house(hdata, original_houses, config, skip_notifications=True)

    # 儲存彙整結果
    output_list = list(all_houses.values())
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(output_list, f, indent=2, ensure_ascii=False)
        
    with open('data.js', 'w', encoding='utf-8') as f:
        f.write("window.crawledData = ")
        json.dump(output_list, f, indent=2, ensure_ascii=False)
        f.write(";\n")
        
    print(f"\n爬蟲完畢！目前總計有 {len(output_list)} 筆有效房源儲存至 data.json 與 data.js。")

if __name__ == '__main__':
    main()

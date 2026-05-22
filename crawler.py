import os
import sys
import json
import time
import random
import subprocess
import requests
import urllib3
import argparse

# Disable insecure request warnings from urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Target regions for real estate data
REGIONS = {
    1: '台北市',
    3: '新北市',
}

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
    print(f"Fetching: {url}")
    
    try:
        r = requests.get(url, headers=headers, cookies=cookies, verify=False, timeout=15)
        if r.status_code != 200:
            print(f"Error fetching page (status {r.status_code})")
            return None
        return r.text
    except Exception as e:
        print(f"Network error occurred: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description="591 售屋爬蟲與自動更新")
    parser.add_argument('--pages', type=int, default=5, help='每個區域要爬取的頁數')
    parser.add_argument('--init', action='store_true', help='初始爬取，僅篩選保留 1 天（24小時）內發布或更新的房源')
    args = parser.parse_args()

    all_houses = {}
    
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
                        all_houses[str(item['id'])] = item
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
            print(f"\n=== 開始爬取區域: {region_name} (ID: {region_id}) ===")
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
                        'id': str(house_id),
                        'title': item.get('title') or item.get('name') or '無標題',
                        'price': price_num,  # 單位：萬 TWD
                        'unit_price': item.get('unit_price') or item.get('unitprice') or '',
                        'area': area_num,     # 單位：坪
                        'room': item.get('room') or '',
                        'region': item.get('region_name') or region_name,
                        'section': item.get('section_name') or '',
                        'community': item.get('community_name') or '',
                        'type': item.get('shape_name') or item.get('housetype') or '住宅',
                        'age': age_num,       # 單位：年
                        'address': item.get('address') or '',
                        'photo': photo or '',
                        'url': f'https://sale.591.com.tw/home/house/detail/2/{house_id}.html',
                        'posttime': item.get('posttime'),
                        'refreshtime': item.get('refreshtime'),
                        'last_seen': int(time.time())
                    }
                    
                    all_houses[str(house_id)] = house_data
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

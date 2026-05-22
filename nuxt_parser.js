const fs = require('fs');

function parseNuxt() {
  const htmlFile = process.argv[2];
  const outputFile = process.argv[3];
  
  if (!htmlFile || !outputFile) {
    console.error("Usage: node nuxt_parser.js <input_html_file> <output_json_file>");
    process.exit(1);
  }
  
  try {
    const html = fs.readFileSync(htmlFile, 'utf8');
    const startKeyword = 'window.__NUXT__=';
    const startIdx = html.indexOf(startKeyword);
    
    if (startIdx === -1) {
      console.error("Could not find window.__NUXT__ in HTML.");
      process.exit(1);
    }
    
    const endIdx = html.indexOf('</script>', startIdx);
    if (endIdx === -1) {
      console.error("Could not find closing script tag after window.__NUXT__.");
      process.exit(1);
    }
    
    let code = html.substring(startIdx + startKeyword.length, endIdx).trim();
    if (code.endsWith(';')) {
      code = code.slice(0, -1);
    }
    
    // Evaluate the nuxt payload
    const payload = eval(`(${code})`);
    
    // Locate the listings array
    const nuxtDataRoot = payload.data || {};
    let listings = [];
    
    for (const key in nuxtDataRoot) {
      const val = nuxtDataRoot[key];
      if (val && typeof val === 'object' && val.data && Array.isArray(val.data.items)) {
        // Confirm this list contains house items (rather than community rankings)
        const items = val.data.items;
        if (items.length > 0 && items[0].houseid) {
          listings = items;
          break;
        }
      }
    }
    
    // Fallback search: look for any list or items
    if (listings.length === 0) {
      for (const key in nuxtDataRoot) {
        const val = nuxtDataRoot[key];
        if (val && typeof val === 'object' && val.data) {
          if (Array.isArray(val.data.items)) {
            listings = val.data.items;
            break;
          }
          if (Array.isArray(val.data.list)) {
            listings = val.data.list;
            break;
          }
        }
      }
    }
    
    fs.writeFileSync(outputFile, JSON.stringify(listings, null, 2), 'utf8');
    console.log(`Successfully parsed ${listings.length} items to ${outputFile}`);
  } catch (err) {
    console.error("Error during Nuxt parsing:", err.message);
    process.exit(1);
  }
}

parseNuxt();

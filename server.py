import http.server
import json
import os
import base64

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def check_auth(self):
        config_path = 'config.json'
        username = "admin"
        password = "admin"
        
        # Ensure credentials exist in config.json
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                changed = False
                if "dashboard_username" not in data:
                    data["dashboard_username"] = "admin"
                    changed = True
                if "dashboard_password" not in data:
                    data["dashboard_password"] = "admin"
                    changed = True
                    
                if changed:
                    with open(config_path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)
                        
                username = data.get('dashboard_username', 'admin')
                password = data.get('dashboard_password', 'admin')
            except Exception:
                pass
                
        auth_header = self.headers.get('Authorization')
        if auth_header is not None and auth_header.startswith('Basic '):
            encoded = auth_header.split(' ', 1)[1]
            try:
                decoded = base64.b64decode(encoded).decode('utf-8')
                u, p = decoded.split(':', 1)
                if u == username and p == password:
                    return True
            except Exception:
                pass
                
        self.send_response(401)
        self.send_header('WWW-Authenticate', 'Basic realm="Dashboard Login"')
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(b"Unauthorized Access - Login Required")
        return False

    def do_POST(self):
        if not self.check_auth():
            return
            
        if self.path == '/api/config':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                new_rules = json.loads(post_data.decode('utf-8'))
                
                # Load existing config.json to keep token/user ID intact
                config_path = 'config.json'
                existing_config = {}
                if os.path.exists(config_path):
                    with open(config_path, 'r', encoding='utf-8') as f:
                        existing_config = json.load(f)
                else:
                    # Initialize default values if missing
                    existing_config = {
                        "line_channel_access_token": "",
                        "line_user_id": "",
                        "notification_rules": {}
                    }
                
                # Update only notification rules
                existing_config['notification_rules'] = new_rules
                
                # Save back to config.json
                with open(config_path, 'w', encoding='utf-8') as f:
                    json.dump(existing_config, f, indent=2, ensure_ascii=False)
                
                # Respond success
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                response = {"status": "success", "message": "Configuration updated successfully."}
                self.wfile.write(json.dumps(response).encode('utf-8'))
                return
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                response = {"status": "error", "message": str(e)}
                self.wfile.write(json.dumps(response).encode('utf-8'))
                return
                
        return super().do_POST()

    def do_GET(self):
        if not self.check_auth():
            return
            
        if self.path == '/api/config/get':
            config_path = 'config.json'
            rules = {}
            if os.path.exists(config_path):
                try:
                    with open(config_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        rules = data.get('notification_rules', {})
                except Exception:
                    pass
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(rules).encode('utf-8'))
            return
            
        return super().do_GET()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == '__main__':
    port = 8888
    server_address = ('', port)
    httpd = http.server.HTTPServer(server_address, CustomHandler)
    print(f"Starting dashboard server on port {port}...")
    httpd.serve_forever()

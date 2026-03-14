"""
Test Receipt Settings API
- GET /api/receipt-settings - Fetch receipt settings for organization
- PUT /api/receipt-settings - Update receipt settings (admin only)
- POST /api/receipt-settings/logo - Upload logo (admin only)
- DELETE /api/receipt-settings/logo - Remove logo (admin only)
"""
import pytest
import requests
import os
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
if BASE_URL:
    BASE_URL = BASE_URL.rstrip('/')

# Test credentials from main agent
TEST_EMAIL = "carlo.mitri@gmail.com"
TEST_PASSWORD = "Carinemi@28"
ORG_ID = "fa6d4449-a859-445f-9e0b-fbb4aa90bfee"


class TestReceiptSettingsAPI:
    """Receipt Settings API Tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_get_receipt_settings(self, auth_headers):
        """Test GET /api/receipt-settings returns settings or defaults"""
        response = requests.get(
            f"{BASE_URL}/api/receipt-settings?organization_id={ORG_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"GET receipt settings failed: {response.text}"
        data = response.json()
        
        # Check expected fields exist
        assert "organization_id" in data
        assert data["organization_id"] == ORG_ID
        
        # Check default fields
        assert "store_name" in data
        assert "printer_width" in data
        assert "show_logo" in data
        assert "footer_message" in data
        print(f"GET receipt settings success: store_name={data.get('store_name')}, printer_width={data.get('printer_width')}")
    
    def test_update_receipt_settings(self, auth_headers):
        """Test PUT /api/receipt-settings updates and persists settings"""
        test_data = {
            "store_name": "TEST_Khayratna Store",
            "store_name_ar": "خيرات نا",
            "address_line1": "Batroun Main Road",
            "address_line2": "North Lebanon",
            "phone": "+961 6 123 456",
            "vat_number": "VAT-123456",
            "footer_message": "Thank you for shopping!",
            "footer_message_ar": "شكرا لتسوقكم",
            "printer_width": "72mm",
            "font_size": "14px",
            "show_logo": True,
            "show_vat_number": True,
            "show_barcode": True
        }
        
        # Update settings
        response = requests.put(
            f"{BASE_URL}/api/receipt-settings?organization_id={ORG_ID}",
            headers=auth_headers,
            json=test_data
        )
        assert response.status_code == 200, f"PUT receipt settings failed: {response.text}"
        data = response.json()
        
        # Verify returned data matches input
        assert data["store_name"] == test_data["store_name"]
        assert data["printer_width"] == test_data["printer_width"]
        assert data["phone"] == test_data["phone"]
        
        # Verify with GET that data persisted
        get_response = requests.get(
            f"{BASE_URL}/api/receipt-settings?organization_id={ORG_ID}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["store_name"] == test_data["store_name"]
        assert get_data["printer_width"] == test_data["printer_width"]
        print(f"PUT receipt settings success: Updated store_name={data['store_name']}, printer_width={data['printer_width']}")
    
    def test_upload_logo(self, auth_headers):
        """Test POST /api/receipt-settings/logo uploads and returns data URI"""
        # Create a small test PNG (1x1 pixel red image)
        # This is a minimal valid PNG
        png_bytes = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg=="
        )
        
        files = {
            'file': ('test_logo.png', png_bytes, 'image/png')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/receipt-settings/logo?organization_id={ORG_ID}",
            headers=auth_headers,
            files=files
        )
        assert response.status_code == 200, f"Logo upload failed: {response.text}"
        data = response.json()
        
        # Verify response contains logo_url as data URI
        assert "logo_url" in data
        assert data["logo_url"].startswith("data:image/")
        assert "filename" in data
        print(f"Logo upload success: filename={data['filename']}, logo_url starts with data URI")
        
        # Verify logo persisted with GET
        get_response = requests.get(
            f"{BASE_URL}/api/receipt-settings?organization_id={ORG_ID}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data.get("logo_url") is not None
        assert get_data["logo_url"].startswith("data:image/")
        print("Logo persisted correctly in settings")
    
    def test_delete_logo(self, auth_headers):
        """Test DELETE /api/receipt-settings/logo removes logo"""
        response = requests.delete(
            f"{BASE_URL}/api/receipt-settings/logo?organization_id={ORG_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Logo delete failed: {response.text}"
        data = response.json()
        assert "message" in data
        
        # Verify logo removed with GET
        get_response = requests.get(
            f"{BASE_URL}/api/receipt-settings?organization_id={ORG_ID}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data.get("logo_url") is None
        print("Logo deleted successfully")
    
    def test_logo_upload_oversized_rejected(self, auth_headers):
        """Test POST /api/receipt-settings/logo rejects files > 500KB"""
        # Create file > 500KB (600KB of data)
        large_data = b'x' * (600 * 1024)
        
        files = {
            'file': ('large_logo.png', large_data, 'image/png')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/receipt-settings/logo?organization_id={ORG_ID}",
            headers=auth_headers,
            files=files
        )
        # Should reject with 400
        assert response.status_code == 400, f"Expected 400 for oversized file, got {response.status_code}"
        print("Oversized logo correctly rejected with 400")
    
    def test_non_image_upload_rejected(self, auth_headers):
        """Test POST /api/receipt-settings/logo rejects non-image files"""
        files = {
            'file': ('test.txt', b'Hello World', 'text/plain')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/receipt-settings/logo?organization_id={ORG_ID}",
            headers=auth_headers,
            files=files
        )
        # Should reject with 400
        assert response.status_code == 400, f"Expected 400 for non-image, got {response.status_code}"
        print("Non-image file correctly rejected with 400")
    
    def test_update_settings_restores_logo_for_ui_test(self, auth_headers):
        """Re-upload logo and restore settings for UI testing"""
        # Upload a logo again
        png_bytes = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg=="
        )
        files = {
            'file': ('store_logo.png', png_bytes, 'image/png')
        }
        requests.post(
            f"{BASE_URL}/api/receipt-settings/logo?organization_id={ORG_ID}",
            headers=auth_headers,
            files=files
        )
        
        # Set final settings for UI testing
        final_settings = {
            "store_name": "Khayratna",
            "store_name_ar": "خيرات نا",
            "address_line1": "Batroun",
            "address_line2": "North Lebanon",
            "phone": "+961 6 123 456",
            "footer_message": "Thank you!",
            "printer_width": "80mm",
            "font_size": "12px",
            "show_logo": True,
            "show_vat_number": True,
            "show_barcode": True
        }
        response = requests.put(
            f"{BASE_URL}/api/receipt-settings?organization_id={ORG_ID}",
            headers=auth_headers,
            json=final_settings
        )
        assert response.status_code == 200
        print(f"Settings restored for UI test: {final_settings['store_name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

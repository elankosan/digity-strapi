#!/usr/bin/env python3
"""
Strapi Content Populator
Reads a markdown seed data file and populates Strapi CMS via REST API

Author: Manus AI
Purpose: Automate content creation for multi-tenant applications
Usage: python3 strapi_content_populator.py <markdown_file> <strapi_url> <api_token>
"""

import json
import re
import sys
import requests
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
import argparse
from urllib.parse import urljoin

# Color codes for terminal output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


class StrapiContentPopulator:
    """Main class for populating Strapi with content from markdown file"""
    
    def __init__(self, strapi_url: str, api_token: str, dry_run: bool = False):
        """
        Initialize the populator
        
        Args:
            strapi_url: Base URL of Strapi instance (e.g., https://cms.example.com)
            api_token: Strapi API token for authentication
            dry_run: If True, don't actually create content, just show what would be created
        """
        self.strapi_url = strapi_url.rstrip('/')
        self.api_token = api_token
        self.dry_run = dry_run
        self.headers = {
            'Authorization': f'Bearer {api_token}',
            'Content-Type': 'application/json'
        }
        self.application_id = None
        self.created_pages = {}
        
    def log_info(self, message: str):
        """Log info message"""
        print(f"{Colors.OKBLUE}ℹ {message}{Colors.ENDC}")
        
    def log_success(self, message: str):
        """Log success message"""
        print(f"{Colors.OKGREEN}✓ {message}{Colors.ENDC}")
        
    def log_warning(self, message: str):
        """Log warning message"""
        print(f"{Colors.WARNING}⚠ {message}{Colors.ENDC}")
        
    def log_error(self, message: str):
        """Log error message"""
        print(f"{Colors.FAIL}✗ {message}{Colors.ENDC}")
        
    def log_header(self, message: str):
        """Log header message"""
        print(f"\n{Colors.BOLD}{Colors.HEADER}{'='*60}{Colors.ENDC}")
        print(f"{Colors.BOLD}{Colors.HEADER}{message}{Colors.ENDC}")
        print(f"{Colors.BOLD}{Colors.HEADER}{'='*60}{Colors.ENDC}\n")
        
    def parse_markdown(self, file_path: str) -> Dict[str, Any]:
        """
        Parse markdown seed data file
        
        Args:
            file_path: Path to markdown file
            
        Returns:
            Dictionary containing parsed metadata, styles, settings, and pages
        """
        self.log_header("Parsing Markdown File")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        self.log_info(f"Reading file: {file_path}")
        
        # Extract metadata section
        metadata = self._extract_section(content, 'METADATA')
        metadata_dict = self._parse_key_value_section(metadata)
        
        # Extract global styles
        global_styles = self._extract_json_section(content, 'GLOBAL STYLES')
        
        # Extract settings
        settings = self._extract_json_section(content, 'SETTINGS')
        
        # Extract pages
        pages = self._extract_pages(content)
        
        self.log_success(f"Parsed {len(pages)} pages from markdown")
        
        return {
            'metadata': metadata_dict,
            'globalStyles': global_styles,
            'settings': settings,
            'pages': pages
        }
    
    def _extract_section(self, content: str, section_name: str) -> str:
        """Extract a section from markdown by header"""
        pattern = rf'## {section_name}\s*\n(.*?)(?=\n## |\Z)'
        match = re.search(pattern, content, re.DOTALL)
        return match.group(1) if match else ""
    
    def _parse_key_value_section(self, section: str) -> Dict[str, str]:
        """Parse key: value pairs from a section"""
        result = {}
        # Remove code blocks
        section = re.sub(r'```.*?```', '', section, flags=re.DOTALL)
        
        for line in section.split('\n'):
            if ':' in line and not line.strip().startswith('#'):
                key, value = line.split(':', 1)
                result[key.strip().lower()] = value.strip()
        
        return result
    
    def _extract_json_section(self, content: str, section_name: str) -> Dict[str, Any]:
        """Extract JSON from a section"""
        section = self._extract_section(content, section_name)
        
        # Find JSON block
        json_match = re.search(r'```json\s*(.*?)\s*```', section, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError as e:
                self.log_error(f"Failed to parse JSON in {section_name}: {e}")
                return {}
        
        return {}
    
    def _extract_pages(self, content: str) -> List[Dict[str, Any]]:
        """Extract all pages from content"""
        pages = []
        
        # Find all PAGE sections
        page_pattern = r'### PAGE: (.*?)\n\n```\n(.*?)\n```'
        
        for match in re.finditer(page_pattern, content, re.DOTALL):
            page_name = match.group(1).strip()
            page_header = match.group(2)
            
            # Parse page metadata
            page_meta = self._parse_key_value_section(page_header)
            
            # Extract content blocks for this page
            page_section_start = match.end()
            page_section_end = content.find('\n### PAGE:', page_section_start)
            if page_section_end == -1:
                page_section_end = content.find('\n---', page_section_start)
            if page_section_end == -1:
                page_section_end = len(content)
            
            page_section = content[page_section_start:page_section_end]
            blocks = self._extract_blocks(page_section)
            
            pages.append({
                'metadata': page_meta,
                'blocks': blocks
            })
        
        return pages
    
    def _extract_blocks(self, page_section: str) -> List[Dict[str, Any]]:
        """Extract all content blocks from a page section"""
        blocks = []
        
        # Find all BLOCK sections
        block_pattern = r'\*\*BLOCK \d+: (.*?)\*\*\n\n```\n(.*?)\n```'
        
        for match in re.finditer(block_pattern, page_section, re.DOTALL):
            block_name = match.group(1).strip()
            block_content = match.group(2)
            
            # Parse block metadata
            block_meta = self._parse_key_value_section(block_content)
            
            # Extract CONTENT and STYLING JSON
            content_match = re.search(r'CONTENT:\s*\n({.*?})\s*STYLING:', block_content, re.DOTALL)
            styling_match = re.search(r'STYLING:\s*\n({.*?})(?:\n|$)', block_content, re.DOTALL)
            
            block_data = {
                'metadata': block_meta,
                'content': {},
                'styling': {}
            }
            
            if content_match:
                try:
                    block_data['content'] = json.loads(content_match.group(1))
                except json.JSONDecodeError:
                    self.log_warning(f"Failed to parse content JSON for block: {block_name}")
            
            if styling_match:
                try:
                    block_data['styling'] = json.loads(styling_match.group(1))
                except json.JSONDecodeError:
                    self.log_warning(f"Failed to parse styling JSON for block: {block_name}")
            
            blocks.append(block_data)
        
        return blocks
    
    def create_application(self, data: Dict[str, Any]) -> bool:
        """
        Create or update the Application in Strapi
        
        Args:
            data: Parsed data from markdown
            
        Returns:
            True if successful, False otherwise
        """
        self.log_header("Creating Application")
        
        metadata = data['metadata']
        
        application_payload = {
            'data': {
                'name': metadata.get('client_name', 'Unnamed Client'),
                'domain': metadata.get('domain', ''),
                'subdomain': metadata.get('subdomain', ''),
                'description': metadata.get('description', ''),
                'contactEmail': metadata.get('contact_email', ''),
                'active': metadata.get('active', 'true').lower() == 'true',
                'globalStyles': data['globalStyles'],
                'settings': data['settings']
            }
        }
        
        if self.dry_run:
            self.log_info("DRY RUN: Would create application with:")
            print(json.dumps(application_payload, indent=2))
            self.application_id = 1  # Mock ID for dry run
            return True
        
        try:
            response = requests.post(
                urljoin(self.strapi_url, '/api/applications'),
                json=application_payload,
                headers=self.headers,
                timeout=30
            )
            
            if response.status_code in [200, 201]:
                result = response.json()
                self.application_id = result['data']['id']
                self.log_success(f"Created application (ID: {self.application_id})")
                return True
            else:
                self.log_error(f"Failed to create application: {response.status_code}")
                self.log_error(response.text)
                return False
                
        except requests.RequestException as e:
            self.log_error(f"Request failed: {e}")
            return False
    
    def create_pages(self, pages: List[Dict[str, Any]]) -> bool:
        """
        Create all pages in Strapi
        
        Args:
            pages: List of page data from parsed markdown
            
        Returns:
            True if all successful, False otherwise
        """
        self.log_header("Creating Pages")
        
        all_success = True
        
        for page_data in pages:
            success = self._create_single_page(page_data)
            all_success = all_success and success
        
        return all_success
    
    def _create_single_page(self, page_data: Dict[str, Any]) -> bool:
        """Create a single page with its content blocks"""
        metadata = page_data['metadata']
        blocks = page_data['blocks']
        
        page_title = metadata.get('title', 'Untitled Page')
        
        self.log_info(f"Creating page: {page_title}")
        
        # Create page
        page_payload = {
            'data': {
                'title': page_title,
                'slug': metadata.get('slug', ''),
                'path': metadata.get('path', '/'),
                'template': metadata.get('template', 'default'),
                'metaTitle': metadata.get('meta_title', ''),
                'metaDescription': metadata.get('meta_description', ''),
                'metaKeywords': metadata.get('meta_keywords', ''),
                'visible': metadata.get('visible', 'true').lower() == 'true',
                'application': self.application_id
            }
        }
        
        if self.dry_run:
            self.log_info(f"DRY RUN: Would create page: {page_title}")
            page_id = len(self.created_pages) + 1
        else:
            try:
                response = requests.post(
                    urljoin(self.strapi_url, '/api/pages'),
                    json=page_payload,
                    headers=self.headers,
                    timeout=30
                )
                
                if response.status_code not in [200, 201]:
                    self.log_error(f"Failed to create page {page_title}: {response.status_code}")
                    self.log_error(response.text)
                    return False
                
                page_id = response.json()['data']['id']
                
            except requests.RequestException as e:
                self.log_error(f"Request failed for page {page_title}: {e}")
                return False
        
        self.created_pages[page_title] = page_id
        self.log_success(f"Created page: {page_title} (ID: {page_id})")
        
        # Create content blocks
        for block_data in blocks:
            if not self._create_content_block(page_id, block_data):
                return False
        
        return True
    
    def _create_content_block(self, page_id: int, block_data: Dict[str, Any]) -> bool:
        """Create a single content block"""
        metadata = block_data['metadata']
        
        block_type = metadata.get('block_type', 'unknown')
        order = int(metadata.get('order', 0))
        
        block_payload = {
            'data': {
                'blockType': block_type,
                'content': block_data.get('content', {}),
                'styling': block_data.get('styling', {}),
                'order': order,
                'visible': metadata.get('visible', 'true').lower() == 'true',
                'page': page_id
            }
        }
        
        if self.dry_run:
            self.log_info(f"  DRY RUN: Would create {block_type} block (order: {order})")
            return True
        
        try:
            response = requests.post(
                urljoin(self.strapi_url, '/api/content-blocks'),
                json=block_payload,
                headers=self.headers,
                timeout=30
            )
            
            if response.status_code not in [200, 201]:
                self.log_error(f"Failed to create {block_type} block: {response.status_code}")
                self.log_error(response.text)
                return False
            
            block_id = response.json()['data']['id']
            self.log_success(f"  Created {block_type} block (ID: {block_id})")
            return True
            
        except requests.RequestException as e:
            self.log_error(f"Request failed for content block: {e}")
            return False
    
    def populate(self, markdown_file: str) -> bool:
        """
        Main method to populate Strapi with content from markdown file
        
        Args:
            markdown_file: Path to markdown seed data file
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Parse markdown
            data = self.parse_markdown(markdown_file)
            
            # Create application
            if not self.create_application(data):
                return False
            
            # Create pages and blocks
            if not self.create_pages(data['pages']):
                return False
            
            self.log_header("Population Complete")
            self.log_success(f"Successfully populated {len(data['pages'])} pages")
            
            return True
            
        except FileNotFoundError:
            self.log_error(f"File not found: {markdown_file}")
            return False
        except Exception as e:
            self.log_error(f"Unexpected error: {e}")
            import traceback
            traceback.print_exc()
            return False


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description='Populate Strapi CMS with content from markdown seed data file'
    )
    parser.add_argument(
        'markdown_file',
        help='Path to markdown seed data file'
    )
    parser.add_argument(
        'strapi_url',
        help='Base URL of Strapi instance (e.g., https://cms.example.com)'
    )
    parser.add_argument(
        'api_token',
        help='Strapi API token for authentication'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be created without actually creating it'
    )
    
    args = parser.parse_args()
    
    # Validate file exists
    if not Path(args.markdown_file).exists():
        print(f"{Colors.FAIL}Error: File not found: {args.markdown_file}{Colors.ENDC}")
        sys.exit(1)
    
    # Create populator and run
    populator = StrapiContentPopulator(
        args.strapi_url,
        args.api_token,
        dry_run=args.dry_run
    )
    
    success = populator.populate(args.markdown_file)
    
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()

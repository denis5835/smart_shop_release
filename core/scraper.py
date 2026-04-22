import requests
from decimal import Decimal
import json
import random
from bs4 import BeautifulSoup
from django.db import transaction
from .models import ProductCache

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/114.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
]

def get_headers():
    return {
        'User-Agent': random.choice(USER_AGENTS),
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-Onliner-Client': 'type=web; version=1.0.0; application=catalog',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'DNT': '1'
    }

def get_available_filters(category: str) -> dict:
    """
    Fetches available filters (facets) for a given category from Onliner API.
    Returns a simplified dictionary of filter IDs and options to help the AI.
    """
    url = f"https://catalog.onliner.by/sdapi/catalog.api/facets/{category}"
    response = requests.get(url, headers=get_headers(), timeout=10)
    
    if response.status_code != 200:
        return {"error": f"Failed to fetch filters for category {category} (Status: {response.status_code})"}
        
    data = response.json()
    facets = data.get('facets', {})
    
    simplified_filters = {}
    
    # Facets structure: {"general": {"items": [...]}}
    for group_key, group_data in facets.items():
        if isinstance(group_data, dict) and 'items' in group_data:
            for item in group_data['items']:
                filter_id = item.get('parameter_id')
                name = item.get('name')
                f_type = item.get('type')
                
                if filter_id and name:
                    filter_info = {"name": name, "type": f_type}
                    
                    if f_type in ['dictionary', 'boolean']:
                        # Extract options from global dictionaries map
                        options = []
                        if filter_id in data.get('dictionaries', {}):
                            for opt in data['dictionaries'][filter_id]:
                                if opt.get('id'):
                                    options.append(opt.get('id'))
                        if options:
                            filter_info["options"] = options  # Keep it simple for AI
                            
                    elif f_type == 'range':
                        filter_info["min"] = item.get('min')
                        filter_info["max"] = item.get('max')
                        
                    simplified_filters[filter_id] = filter_info

    return simplified_filters

def search_products(category: str, filter_params: dict) -> list:
    """
    Scrapes products for the category with given filters.
    Applies rent calculation logic and caches products.
    """
    url = f"https://catalog.onliner.by/sdapi/catalog.api/search/{category}"
    params = {'group': 0, 'limit': 30}
    
    # Process filter_params correctly. Some might need array notation based on Onliner API
    # Assuming filter_params is a simple dict passed by the AI
    for key, val in filter_params.items():
        if isinstance(val, list):
            for i, v in enumerate(val):
                params[f"{key}[{i}]"] = v
            # To apply multiple dictionary selections, Onliner uses operation=union
            params[f"{key}[operation]"] = 'union'
        else:
            params[key] = val
            
    response = requests.get(url, params=params, headers=get_headers(), timeout=10)
    if response.status_code != 200:
        return []
        
    data = response.json()
    items = data.get('products', [])
    
    results = []
    
    with transaction.atomic():
        for item in items:
            onliner_key = item.get('key')
            name = item.get('full_name') or item.get('name')
            description = item.get('description', '')
            html_url = item.get('html_url', '')
            
            images = item.get('images', {})
            image_url = images.get('header', '')
            
            prices = item.get('prices', {})
            if not prices:
                continue
                
            price_min_data = prices.get('price_min', {})
            amount_str = price_min_data.get('amount')
            
            if not amount_str:
                continue
                
            original_price = Decimal(amount_str)
            
            if original_price <= Decimal('0'):
                continue
            
            # Rent = price / 170, minimum 1 BYN/day
            calculated_rent = original_price / Decimal('170')
            rent_price = max(calculated_rent, Decimal('1.00'))
            rent_price = rent_price.quantize(Decimal('0.01'))
            
            # Items too cheap to rent (under 100 BYN)
            rentable = original_price >= Decimal('100')
            
            product, created = ProductCache.objects.update_or_create(
                onliner_key=onliner_key,
                defaults={
                    'schema_key': category,
                    'name': name,
                    'description': description,
                    'image_url': image_url,
                    'original_price': original_price,
                    'rent_price': rent_price,
                    'html_url': html_url,
                }
            )
            
            results.append({
                'id': product.id,
                'name': product.name,
                'rent_price': str(product.rent_price),
                'original_price': str(product.original_price),
                'image_url': product.image_url,
                'description': product.description,
                'rentable': rentable,
            })
            
    return results

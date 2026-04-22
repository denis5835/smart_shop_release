from django.test import TestCase
from unittest.mock import patch
from decimal import Decimal
from .models import ProductCache
from .scraper import search_products, get_available_filters

class ScraperTests(TestCase):

    @patch('core.scraper.requests.get')
    def test_search_products_rent_logic(self, mock_get):
        # Mock the Onliner Response
        mock_response = mock_get.return_value
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'products': [
                {
                    'key': 'item1_cheap',
                    'full_name': 'Cheap Item',
                    'prices': {'price_min': {'amount': '90.00'}} # Should be skipped (<= 100)
                },
                {
                    'key': 'item2_minimum_rent',
                    'full_name': 'Minimum Rent Item',
                    'prices': {'price_min': {'amount': '150.00'}} # Rent: 150/360 = 0.41 -> 2.00 BYN
                },
                {
                    'key': 'item3_normal',
                    'full_name': 'Normal Bike',
                    'prices': {'price_min': {'amount': '1080.00'}} # Rent: 1080/360 = 3.00 BYN
                }
            ]
        }

        results = search_products('bike', {'bike_class': 'mountain'})
        
        # Verify Results Length
        self.assertEqual(len(results), 2, "Should have 2 rentable products")
        
        # Verify db objects created successfully
        self.assertEqual(ProductCache.objects.count(), 2)

        # Check pricing mathematically derived
        product_min = ProductCache.objects.get(onliner_key='item2_minimum_rent')
        self.assertEqual(product_min.rent_price, Decimal('2.00'), "Minimum rent price constraint failed")
        
        product_normal = ProductCache.objects.get(onliner_key='item3_normal')
        self.assertEqual(product_normal.rent_price, Decimal('3.00'), "Standard rent calculation failed")

    @patch('core.scraper.requests.get')
    def test_get_available_filters_format(self, mock_get):
        # Mock the Facets response
        mock_response = mock_get.return_value
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'facets': {
                'general': {
                    'items': [
                        {
                            'parameter_id': 'test_filter',
                            'name': 'Test Filter',
                            'type': 'dictionary',
                            'dictionary_values': [
                                {'id': 'val1', 'name': 'Value 1'}
                            ]
                        }
                    ]
                }
            }
        }
        
        filters = get_available_filters('bike')
        self.assertIn('test_filter', filters)
        self.assertEqual(filters['test_filter']['name'], 'Test Filter')
        self.assertEqual(filters['test_filter']['options'], ['val1'])

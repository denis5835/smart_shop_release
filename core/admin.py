from django.contrib import admin
from .models import ProductCache, Roadmap, RoadmapItem, CartItem

@admin.register(ProductCache)
class ProductCacheAdmin(admin.ModelAdmin):
    list_display = ('name', 'schema_key', 'original_price', 'rent_price')
    search_fields = ('name', 'onliner_key')
    list_filter = ('schema_key',)

@admin.register(Roadmap)
class RoadmapAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_demo', 'created_at')
    list_filter = ('is_demo',)

@admin.register(RoadmapItem)
class RoadmapItemAdmin(admin.ModelAdmin):
    list_display = ('roadmap', 'product', 'step_number')
    list_filter = ('roadmap',)

@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ('session_key', 'product', 'quantity', 'mode', 'days', 'added_at')
    list_filter = ('mode',)

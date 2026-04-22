from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('api/chat', views.api_chat, name='api_chat'),
    path('cart/', views.cart_view, name='cart'),
    path('api/cart', views.api_get_cart, name='api_get_cart'),
    path('cart/add', views.add_to_cart, name='add_to_cart'),
    path('cart/checkout', views.checkout_dummy, name='checkout'),
    path('cart/success', views.checkout_success, name='checkout_success'),
]

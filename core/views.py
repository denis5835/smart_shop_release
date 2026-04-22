import json
from decimal import Decimal
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from .models import Roadmap, RoadmapItem, ProductCache, CartItem
from .chatbot import TourismChatbot

bot = TourismChatbot()

@ensure_csrf_cookie
def index(request):
    roadmaps = Roadmap.objects.filter(is_demo=True).prefetch_related('items__product')
    return render(request, 'index.html', {'roadmaps': roadmaps})

def api_chat(request):
    """Single endpoint: receives messages, returns a streaming response of JSON chunks."""
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            messages = data.get('messages', [])
            
            gen = bot.chat_stream(messages)
            
            return StreamingHttpResponse(gen, content_type='application/x-ndjson')
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'status': 'error', 'reply': 'Произошла ошибка сервера.', 'stages': []})
    return JsonResponse({'status': 'error', 'reply': 'Недопустимый запрос.', 'stages': []})

def get_discount_multiplier(days):
    if days >= 14: return Decimal('0.7')
    if days >= 7: return Decimal('0.8')
    if days >= 3: return Decimal('0.9')
    return Decimal('1.0')

def cart_view(request):
    """Fallback: redirect to index with #cart in hash or just serve index."""
    roadmaps = Roadmap.objects.filter(is_demo=True).prefetch_related('items__product')
    return render(request, 'index.html', {'roadmaps': roadmaps, 'start_view': 'cart'})

def api_get_cart(request):
    if not request.session.session_key:
        request.session.create()
        
    items = CartItem.objects.filter(session_key=request.session.session_key).select_related('product')
    
    total = 0
    cart_items = []
    for item in items:
        if item.mode == 'buy':
            subtotal = item.product.original_price * item.quantity
        else:
            mult = get_discount_multiplier(item.days)
            subtotal = (item.product.rent_price * item.quantity * item.days * mult).quantize(Decimal('0.01'))
        total += subtotal
        cart_items.append({
            'id': item.id,
            'product_id': item.product.id,
            'name': item.product.name,
            'image_url': item.product.image_url,
            'mode': item.mode,
            'days': item.days,
            'price': float(item.product.original_price if item.mode == 'buy' else item.product.rent_price),
            'quantity': item.quantity,
            'subtotal': float(subtotal),
        })
        
    return JsonResponse({'items': cart_items, 'total': float(total)})

def add_to_cart(request):
    if request.method == "POST":
        try:
            if not request.session.session_key:
                request.session.create()
                
            data = json.loads(request.body)
            product_id = data.get('product_id')
            days = int(data.get('days', 1))
            mode = data.get('mode', 'rent')
            if mode not in ('rent', 'buy'):
                mode = 'rent'
            
            product = get_object_or_404(ProductCache, id=product_id)
            
            cart_item, created = CartItem.objects.get_or_create(
                session_key=request.session.session_key,
                product=product,
                mode=mode,
                defaults={'days': days, 'quantity': 1}
            )
            
            if not created:
                cart_item.quantity += 1
                cart_item.days = days  # Update days to latest selection
                cart_item.save()
                
            return JsonResponse({'status': 'success'})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})
    return JsonResponse({'status': 'error', 'message': 'Invalid request'})

def checkout_dummy(request):
    if request.method == "POST":
        if request.session.session_key:
            CartItem.objects.filter(session_key=request.session.session_key).delete()
        return JsonResponse({'status': 'success', 'message': 'Payment successful! Equipment reserved.'})
    return JsonResponse({'status': 'error'})

def checkout_success(request):
    return render(request, 'checkout_success.html')

from django.db import models

class ProductCache(models.Model):
    onliner_key = models.CharField(max_length=100, unique=True)
    schema_key = models.CharField(max_length=50) # e.g., 'bike'
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    image_url = models.URLField(blank=True, max_length=500)
    original_price = models.DecimalField(max_digits=10, decimal_places=2)
    rent_price = models.DecimalField(max_digits=10, decimal_places=2)
    html_url = models.URLField(max_length=500)

    def __str__(self):
        return f"{self.name} ({self.rent_price} BYN/day)"

class Roadmap(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField()
    is_demo = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class RoadmapItem(models.Model):
    roadmap = models.ForeignKey(Roadmap, related_name='items', on_delete=models.CASCADE)
    product = models.ForeignKey(ProductCache, on_delete=models.CASCADE)
    step_number = models.IntegerField(default=1)
    suggestion_reason = models.TextField(blank=True)

    class Meta:
        ordering = ['step_number']

    def __str__(self):
        return f"{self.roadmap.name} - Step {self.step_number}: {self.product.name}"

class CartItem(models.Model):
    MODE_CHOICES = [('rent', 'Аренда'), ('buy', 'Покупка')]
    session_key = models.CharField(max_length=100, blank=True, null=True)
    product = models.ForeignKey(ProductCache, on_delete=models.CASCADE)
    quantity = models.IntegerField(default=1)
    days = models.IntegerField(default=1)
    mode = models.CharField(max_length=4, choices=MODE_CHOICES, default='rent')
    added_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Cart {self.session_key} - {self.product.name} x {self.quantity} ({self.mode})"

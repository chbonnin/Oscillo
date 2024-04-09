from django.urls import path
from . import views

app_name = 'oscillo'


urlpatterns = [
    path('', views.home_oscillo, name='home_oscillo')
    
]
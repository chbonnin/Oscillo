from django.urls import path
from .views import login_view, register_view, oscillo, disconnect

app_name = 'oscillo'


urlpatterns = [
    path('', oscillo, name='oscillo'),

    #User related patterns
    path('login/', login_view, name='login'),
    path('register/', register_view, name='register'),
    path('disconnect/', disconnect, name='disconnect'),
]
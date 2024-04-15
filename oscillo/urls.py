from django.urls import path
from oscillo import views

app_name = 'oscillo'
main = views.Main()



urlpatterns = [
    path('', main.index, name='index'),


    path("settings/", main.settings),
    path("data/", main.getData),


    #User related patterns
    path('login/', views.login_view, name='login'),
    path('register/', views.register_view, name='register'),
    path('disconnect/', views.disconnect, name='disconnect'),
]
#!/bin/bash

docker run --name oscillo-app --link mysql:mysql -e DATABASE_URL=mysql://owen:j38fqt@mysql:3306/CNRS -p 8000:8000 -v ~/OSCILLO:/app -d oscillo-app

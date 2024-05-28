#!/bin/bash

docker run --name mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=CNRS -e MYSQL_USER=owen -e MYSQL_PASSWORD=j38fqt -p 3307:3306 -d mysql:8.0

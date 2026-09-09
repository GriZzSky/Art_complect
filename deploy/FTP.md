# FTP-приёмник выгрузок 1С

Магазин выгружает CommerceML прямо на VPS, в папку `webdata`, откуда бэкенд
уже читает каталог, цены и фото. Доступ разрешён только с IP магазина.

Сервис `ftp` описан в `docker-compose.prod.yml`. Здесь — то, что делается
руками на сервере.

## 1. Заполнить секреты

```bash
cd ~/art-komplekt
tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24; echo   # пароль для магазина
curl -s ifconfig.me; echo                              # публичный IP VPS
nano deploy/.env.prod
```

В `deploy/.env.prod`:

```
SERVER_PUBLIC_IP=<IP из curl выше>
FTP_LOGIN=1c_upload
FTP_PASSWORD=<сгенерированный пароль>
```

Пароль — **только буквы и цифры**. Символ `|` разделяет поля в переменной
`USERS`, пробел разделяет учётки; и то, и другое сломает вход.

Сам `deploy/.env.prod` в git не попадает — он в `.gitignore`.

## 2. Права на папку выгрузки

FTP-пользователь работает под uid/gid 1000, а `webdata` сейчас принадлежит
root — без этого шага загрузка будет падать с «550 Permission denied»:

```bash
chown -R 1000:1000 ~/art-komplekt/webdata
```

Бэкенд читает эту папку из-под root и на смену владельца не реагирует.

Если позже будете доливать файлы через `rsync` из-под root, они снова станут
root-овыми и магазин не сможет их перезаписать — тогда повторите `chown`.

## 3. Поднять сервис

```bash
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml up -d ftp
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml logs ftp
```

## 4. Ограничить доступ по IP — через DOCKER-USER, не через ufw

**Это главный подводный камень.** Docker публикует порты, вставляя правила в
iptables напрямую, и трафик к контейнерам не проходит через цепочку, которой
управляет `ufw`. Правило `ufw deny 21` создаст полную иллюзию защиты, а FTP
при этом останется открыт всему интернету.

Ограничение ставится в цепочке `DOCKER-USER` — её Docker просматривает раньше
собственных правил:

```bash
# разрешить магазину
iptables -I DOCKER-USER -p tcp -m multiport --dports 21,21000:21010 \
  -s 158.46.15.2 -j RETURN
# всем остальным — запретить
iptables -I DOCKER-USER 2 -p tcp -m multiport --dports 21,21000:21010 -j DROP
```

Порядок важен: разрешающее правило должно стоять первым. Проверить:

```bash
iptables -L DOCKER-USER -n --line-numbers -v
```

Сохранить, чтобы пережило перезагрузку:

```bash
DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
netfilter-persistent save
```

## 5. Доступ по SSH со своего IP

**Сначала убедитесь, что у хостера есть веб-консоль (VNC) — это единственный
путь назад, если правило окажется неверным.**

```bash
ufw allow from <ВАШ_IP> to any port 22 proto tcp
ufw --force enable
```

Страховка от блокировки — отложенное отключение файрвола, которое сработает,
если вы не успеете отменить его новым входом:

```bash
apt-get install -y at
echo 'ufw disable' | at now + 10 minutes
# успешно зашли новой сессией — снимаем страховку:
atrm $(atq | awk '{print $1}')
```

Сайт от `ufw` не пострадает: порты 80 и 443 публикует Docker, и они, как
описано выше, идут мимо ufw.

Если IP у вас динамический (обычный домашний провайдер), ограничивать SSH по
адресу опасно — при смене адреса вы потеряете доступ. Надёжнее оставить порт
открытым, но запретить вход по паролю и ходить по ключу.

## 6. Проверка

С машины, которой доступ **не** разрешён — соединение должно отваливаться по
таймауту:

```bash
curl -v --connect-timeout 10 ftp://<IP сервера>/
```

Проверять с самого VPS бессмысленно: подключение с хоста к опубликованному
порту идёт не через `FORWARD`, а значит `DOCKER-USER` к нему не применяется, и
вход пройдёт независимо от правил. Это не поломка ограничения.

Полная проверка — попросить магазин выгрузить тестовый файл и посмотреть:

```bash
ls -la ~/art-komplekt/webdata/
```

## 7. Что передать заказчику

```
Сервер:    <IP или art-komplekt.shop>
Порт:      21
Режим:     пассивный (passive)
Логин:     1c_upload
Пароль:    <сгенерированный>
Папка:     / (корень)

Куда класть:
  import0_1.xml   — каталог товаров
  offers0_1.xml   — цены и остатки
  import_files/   — фотографии

Доступ открыт только с IP 158.46.15.2.
```

## 8. После загрузки нужна синхронизация

Файлы сами в каталог не поедут — их разбирает отдельная команда:

```bash
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml \
  exec api python -m scripts.run_catalog_sync
```

Чтобы не запускать руками после каждой выгрузки, повесьте на cron
(`crontab -e`), например ежедневно в 4 утра:

```
0 4 * * * cd /root/art-komplekt && docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml exec -T api python -m scripts.run_catalog_sync >> /var/log/art-sync.log 2>&1
```

Флаг `-T` обязателен: без терминала `docker compose exec` в cron падает.

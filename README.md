# Story Back - Express Starter

Basit bir Express.js başlangıç projesi.

## Kurulum

```
npm install
```

### Ortam Değişkenleri

Proje kökünde `.env` dosyası oluşturun (örnek değerler):

```
PGUSER=emir
PGPASSWORD=<postgres_sifreniz>
PGHOST=localhost
PGPORT=5432
PGDATABASE=fable
PORT=3000
```

## Geliştirme

```
npm run dev
```

Sunucu varsayılan olarak `http://localhost:3000` adresinde çalışır.

## Üretim

```
npm start
```

## Rotalar
- `GET /` → `{ message: "Merhaba Express!" }`

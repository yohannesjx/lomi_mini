# Check Users in Database

## Quick Commands

### Option 1: Using Docker Exec (Easiest)

```bash
# Connect to PostgreSQL container and query users
docker-compose -f docker-compose.prod.yml exec postgres psql -U lomi_user -d lomi_db -c "SELECT id, telegram_id, telegram_username, telegram_first_name, name, age, gender, city, created_at FROM users ORDER BY created_at DESC;"
```

### Option 2: Connect to PostgreSQL Directly

```bash
# Get into PostgreSQL container
docker-compose -f docker-compose.prod.yml exec postgres psql -U lomi_user -d lomi_db

# Then run SQL queries:
SELECT id, telegram_id, telegram_username, telegram_first_name, name, age, gender, city, created_at 
FROM users 
ORDER BY created_at DESC;
```

### Option 3: Show All Columns

```bash
docker-compose -f docker-compose.prod.yml exec postgres psql -U lomi_user -d lomi_db -c "SELECT * FROM users ORDER BY created_at DESC;"
```

### Option 4: Count Users

```bash
docker-compose -f docker-compose.prod.yml exec postgres psql -U lomi_user -d lomi_db -c "SELECT COUNT(*) as total_users FROM users;"
```

### Option 5: Show Only Telegram Users

```bash
docker-compose -f docker-compose.prod.yml exec postgres psql -U lomi_user -d lomi_db -c "SELECT id, telegram_id, telegram_username, telegram_first_name, name, created_at FROM users WHERE telegram_id > 0 ORDER BY created_at DESC;"
```

## Pretty Format

```bash
# Show in a nicer format
docker-compose -f docker-compose.prod.yml exec postgres psql -U lomi_user -d lomi_db -c "\x" -c "SELECT * FROM users ORDER BY created_at DESC LIMIT 10;"
```

## Export to File

```bash
# Export users to CSV
docker-compose -f docker-compose.prod.yml exec postgres psql -U lomi_user -d lomi_db -c "COPY (SELECT * FROM users ORDER BY created_at DESC) TO STDOUT WITH CSV HEADER;" > users.csv
```

## Common Queries

### Show user count by registration date
```sql
SELECT DATE(created_at) as date, COUNT(*) as count 
FROM users 
GROUP BY DATE(created_at) 
ORDER BY date DESC;
```

### Show users with Telegram info
```sql
SELECT 
    id,
    telegram_id,
    telegram_username,
    telegram_first_name,
    name,
    age,
    gender,
    city,
    created_at
FROM users
WHERE telegram_id IS NOT NULL
ORDER BY created_at DESC;
```

### Show recent registrations
```sql
SELECT 
    id,
    telegram_id,
    telegram_username,
    name,
    created_at
FROM users
ORDER BY created_at DESC
LIMIT 20;
```


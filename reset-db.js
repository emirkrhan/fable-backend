#!/usr/bin/env node

/**
 * Database Reset Script
 *
 * Çalıştırınca:
 * 1. Tüm tabloları siler
 * 2. Yeni schema oluşturur
 * 3. Admin user oluşturur (korhanemirhann@gmail.com)
 *
 * Kullanım: node reset-db.js
 */

const { pool, ensureSchema } = require('./src/db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function resetDatabase() {
  try {
    console.log('\n🗑️  Siliniyor: Tüm tablolar...');

    // Tüm tabloları sil
    await pool.query(`
      DROP TABLE IF EXISTS favorite_boards CASCADE;
      DROP TABLE IF EXISTS premium_code_usage CASCADE;
      DROP TABLE IF EXISTS premium_codes CASCADE;
      DROP TABLE IF EXISTS daily_ai_usage CASCADE;
      DROP TABLE IF EXISTS chat_messages CASCADE;
      DROP TABLE IF EXISTS chats CASCADE;
      DROP TABLE IF EXISTS board_shares CASCADE;
      DROP TABLE IF EXISTS boards CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);

    console.log('✅ Tüm tablolar silindi\n');

    console.log('📐 Oluşturuluyor: Yeni schema...');

    // Yeni schema oluştur
    await ensureSchema();

    console.log('✅ Schema oluşturuldu\n');

    console.log('👤 Oluşturuluyor: Admin user...');

    // Admin user oluştur
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash('4124124122', 10);

    await pool.query(
      `INSERT INTO users (id, email, name, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, 'korhanemirhann@gmail.com', 'Emir', passwordHash, 'admin']
    );

    console.log('✅ Admin user oluşturuldu');
    console.log('   Email: korhanemirhann@gmail.com');
    console.log('   Şifre: 4124124122');
    console.log('   Role: admin\n');

    console.log('✅ Database sıfırlama tamamlandı!\n');

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ HATA:', error.message);
    await pool.end();
    process.exit(1);
  }
}

resetDatabase();

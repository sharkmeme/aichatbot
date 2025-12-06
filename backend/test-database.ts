/**
 * Database Connection Test Script
 * Run with: npx ts-node test-database.ts
 */

import { pool } from './src/config/database';
import { config } from './src/config';

async function testDatabase() {
  console.log('\n🔍 Testing Database Connection...\n');
  console.log('Configuration:');
  console.log('- DATABASE_URL:', config.databaseUrl ? `${config.databaseUrl.substring(0, 30)}...` : 'NOT SET');
  console.log('- NODE_ENV:', config.nodeEnv);
  console.log('');

  try {
    // Test 1: Basic connection
    console.log('Test 1: Connecting to database...');
    const client = await pool.connect();
    console.log('✅ Connection successful');

    // Test 2: Query test
    console.log('\nTest 2: Running test query...');
    const result = await client.query('SELECT NOW()');
    console.log('✅ Query successful. Server time:', result.rows[0].now);

    // Test 3: Check tables exist
    console.log('\nTest 3: Checking tables...');
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    if (tables.rows.length === 0) {
      console.log('⚠️  No tables found in database!');
      console.log('   You may need to run migrations or create tables.');
    } else {
      console.log('✅ Found tables:');
      tables.rows.forEach(row => {
        console.log('   -', row.table_name);
      });
    }

    // Test 4: Check specific tables we need
    console.log('\nTest 4: Checking required tables...');
    const requiredTables = ['conversations', 'messages', 'leads'];
    const existingTables = tables.rows.map(row => row.table_name);

    let allTablesExist = true;
    for (const tableName of requiredTables) {
      if (existingTables.includes(tableName)) {
        console.log(`✅ Table '${tableName}' exists`);

        // Count rows
        const countResult = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
        console.log(`   Rows: ${countResult.rows[0].count}`);
      } else {
        console.log(`❌ Table '${tableName}' MISSING`);
        allTablesExist = false;
      }
    }

    client.release();

    console.log('\n' + '='.repeat(50));
    if (allTablesExist) {
      console.log('✅ Database is properly configured!');
    } else {
      console.log('⚠️  Database is missing required tables.');
      console.log('   Please create tables using the Supabase SQL editor.');
    }
    console.log('='.repeat(50) + '\n');

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Database test FAILED:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    console.error('\nCommon issues:');
    console.error('1. DATABASE_URL is not set or incorrect in .env file');
    console.error('2. Database credentials are wrong');
    console.error('3. Database server is not accessible');
    console.error('4. SSL/firewall blocking connection');
    console.error('\nPlease check your .env file and Supabase settings.\n');
    process.exit(1);
  }
}

testDatabase();

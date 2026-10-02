// Runs before every test file (jest setupFiles).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_only_secret_' + 'x'.repeat(48);
process.env.JWT_EXPIRES_IN = '1h';

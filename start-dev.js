#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting AI App Builder Development Environment...\n');

// Start backend server
console.log('📡 Starting backend server...');
const backend = spawn('pnpm', ['run', 'dev'], {
  cwd: path.join(__dirname, 'server'),
  stdio: 'inherit',
  shell: true
});

// Wait a moment for backend to start
setTimeout(() => {
  // Start frontend server
  console.log('🎨 Starting frontend server...');
  const frontend = spawn('pnpm', ['run', 'dev'], {
    cwd: path.join(__dirname, 'client'),
    stdio: 'inherit',
    shell: true
  });

  // Handle process cleanup
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down development servers...');
    backend.kill('SIGINT');
    frontend.kill('SIGINT');
    process.exit(0);
  });

  frontend.on('close', (code) => {
    console.log(`Frontend server exited with code ${code}`);
    backend.kill('SIGINT');
    process.exit(code);
  });

  backend.on('close', (code) => {
    console.log(`Backend server exited with code ${code}`);
    frontend.kill('SIGINT');
    process.exit(code);
  });
}, 2000);

backend.on('close', (code) => {
  console.log(`Backend server exited with code ${code}`);
  process.exit(code);
});
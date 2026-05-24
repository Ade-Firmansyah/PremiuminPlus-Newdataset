module.exports = {
  apps: [
    {
      name: 'premiumin-api',
      script: 'backend/server.js',
      node_args: '--enable-source-maps',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '700M',
      time: true,
    },
    {
      name: 'premiumin-bot',
      script: 'bot-engine/server.js',
      node_args: '--enable-source-maps',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '700M',
      time: true,
    },
  ],
};

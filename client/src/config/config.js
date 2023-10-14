const config = {
  development: {
    backendUrl: import.meta.env.VITE_BACKEND_DEV_URL,
  },
  production: {
    backendUrl: import.meta.env.VITE_BACKEND_PROD_URL,
  },
};

export default config;

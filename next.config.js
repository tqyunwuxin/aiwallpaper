/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'gpts-works.s3.us-west-1.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'trysai.s3.us-west-1.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'e844dd16b782b15c206441df8df9aab4.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: 'pub-b3b0705070114d239cfb5b06f7130d0c.r2.dev',
      },
    ],
  },
};

module.exports = nextConfig;

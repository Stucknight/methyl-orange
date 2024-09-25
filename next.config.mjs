/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config) => {
        config.module.rules.push({
            test: /\.wgsl$/,
            use: 'raw-loader',
        });
        return config;
    },
    output: "export"
};

export default nextConfig;
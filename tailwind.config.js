/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./App.tsx",
        "./index.tsx",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./hooks/**/*.{js,ts,jsx,tsx}",
        "./utils/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                mono: ['JetBrains Mono', 'monospace'],
            },
            colors: {
                stone: {
                    550: '#6a635d',
                    750: '#221f1d',
                    850: '#171412',
                    855: '#141210',
                    955: '#080706',
                },
                red: {
                    450: '#ef3838',
                    650: '#ba1818',
                    750: '#9e1414',
                    955: '#300505',
                },
                amber: {
                    650: '#bd5e06',
                    955: '#351603',
                },
                cyan: {
                    850: '#114a5c',
                    955: '#041f26',
                },
                emerald: {
                    955: '#032514',
                },
                neutral: {
                    850: '#1f1f1f',
                },
                purple: {
                    450: '#a452ef',
                    955: '#27083f',
                },
                yellow: {
                    955: '#362402',
                },
            },
        },
    },
    plugins: [],
}

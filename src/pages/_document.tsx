import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" href="/images/favicon.png" type="image/png" />
        <link rel="shortcut icon" href="/images/favicon.png" type="image/png" />
        {/* Inter Font */}
        <link rel="preconnect" href="https://rsms.me" />
        <style dangerouslySetInnerHTML={{
          __html: `@import url('https://rsms.me/inter/inter.css');`
        }} />
      </Head>
      <body>
        {/* Theme Script - runs before React hydration to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var themeConfig = {
                  'theme': 'dark',
                  'theme-base': 'stone',
                  'theme-font': 'sans-serif',
                  'theme-primary': 'pink',
                  'theme-radius': '1'
                };
                for (var key in themeConfig) {
                  var value = localStorage.getItem('tabler-' + key) || themeConfig[key];
                  document.documentElement.setAttribute('data-bs-' + key, value);
                }
              })();
            `,
          }}
        />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

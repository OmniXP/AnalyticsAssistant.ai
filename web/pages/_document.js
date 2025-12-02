import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Favicon for light mode (default) */}
        <link rel="icon" href="/favicon/AAA-Favicon-Light.png" />
        
        {/* Favicon for dark mode */}
        <link rel="icon" href="/favicon/AAA-Favicon-Dark.png" media="(prefers-color-scheme: dark)" />
        
        {/* Fallback favicon */}
        <link rel="icon" type="image/png" href="/favicon/AAA-Favicon-Light.png" />
        
        {/* Apple touch icon */}
        <link rel="apple-touch-icon" href="/favicon/AAA-Favicon-Light.png" />
        
        {/* Dynamic favicon switcher for better browser support */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function setFavicon() {
                  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                  const favicon = document.querySelector('link[rel="icon"]');
                  if (favicon) {
                    favicon.href = isDark 
                      ? '/favicon/AAA-Favicon-Dark.png' 
                      : '/favicon/AAA-Favicon-Light.png';
                  }
                }
                
                // Set on load
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', setFavicon);
                } else {
                  setFavicon();
                }
                
                // Update on color scheme change
                if (window.matchMedia) {
                  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setFavicon);
                }
              })();
            `,
          }}
        />
        
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-K37FJ1P6V5" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-K37FJ1P6V5');
            `,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

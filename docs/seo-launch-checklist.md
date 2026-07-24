# Furvise SEO launch checklist

## Canonical domain

The canonical origin is `https://www.furvise.com`.

The apex URL, `https://furvise.com`, returned a permanent redirect to the www host during the July 23, 2026 audit. The www host returned the final 200 response, so Search Console can correctly report the apex as a page with redirect.

Keep the canonical domain consistent with Vercel domain redirect settings and the Google Search Console property. The application also permanently redirects the production Vercel alias to the canonical host. Vercel preview deployments should remain non-production and must not be submitted for indexing.

## Search Console property

Use the URL-prefix property `https://www.furvise.com/` for URL inspection. If the verified Domain property `furvise.com` is available, it can also show data across the apex and www hosts, but every URL submitted for indexing should use the www canonical host.

## URLs to verify after deployment

- Canonical home: `https://www.furvise.com/`
- Public privacy page: `https://www.furvise.com/privacy`
- Sitemap: `https://www.furvise.com/sitemap.xml`
- Robots: `https://www.furvise.com/robots.txt`
- Open Graph image: `https://www.furvise.com/brand/furvise-og.png`
- Brand logo: `https://www.furvise.com/brand/furvise-logo.png`
- Apex redirect: `https://furvise.com/`
- Production alias redirect: `https://petwise-nu.vercel.app/`

## Launch steps

- Deploy the production build.
- Confirm the apex and production Vercel alias permanently redirect to the same www URL and preserve the requested path.
- Test the live canonical home URL in Search Console.
- Inspect `https://www.furvise.com/` and request indexing.
- Inspect `https://www.furvise.com/privacy` and request indexing if appropriate.
- Submit `https://www.furvise.com/sitemap.xml` in Search Console.
- Open `https://www.furvise.com/robots.txt` and confirm the sitemap line and private route exclusions.
- Open `https://www.furvise.com/sitemap.xml` and confirm that only public, indexable URLs are listed.
- Confirm private app pages emit `noindex` metadata after authentication and when signed out.
- Check Google results again after several days. Google controls when the favicon, logo, title, and snippet refresh, so changes may not appear immediately.

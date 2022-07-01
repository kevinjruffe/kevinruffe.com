# ☘️ KevinRuffe.com ☘️

This is a bespoke static site generator for [KevinRuffe.com](https://kevinruffe.com). It lets me write new posts in Markdown, push to GitHub and have my site build/deploy onto a CDN network.

Contents:

- [The Story Behind the Code.](#the-story-behind-the-code)
- [Glossary of `npm` Scripts](#glossary-of-npm-scripts)
- [Some Future Plans](#some-future-plans)

## The Story Behind the Code

### Another version of your personal site?!

First, some context. Yes, this is another version of my personal site. Previous versions this of site have been made with raw HTML, a custom PHP framework, [Laravel](https://laravel.com/), and [Next.js](https://nextjs.org/). The previous versions were _just fine._ In the case of the last two versions, they even had more "features" than this site -- things like tagging, search, contact forms, etc. The only problem is that I hardly ever posted to those sites.

In the case of the first two, I was writing in HTML, and that always feels awkward to me. In the case of the last two, I was writing into a CMS (a custom one and [Contentful](https://www.contentful.com/), respectively), and while that is better, there's just a lot more of a "process" to writing a post that way than I liked. I came to realize that what I really wanted was to just write some Markdown in `vim` and push to version control to trigger publishing. And so here we are, at version 5 of this site.

### The tech employed in making this.

I considered a few options early on, including static site generators like [Eleventy](https://www.11ty.dev/) and [Gatsby](https://www.gatsbyjs.com/) (or even leveraging Next.js again -- it _is_ a great framework), but ultimately I knew that isolating myself from framework maintenance was a goal for this project. If my personal site starts to feel like work it's not something I'll make heavy use of. Instead, I wrote my own static site generator that builds my website via a TS script and the build output can be deployed on any CDN network.

As it stands right now, I have 4 small dependencies (not counting dev-dependencies, which are also nearly all for convenience's sake):

- [`clean-css-cli`](https://github.com/clean-css/clean-css-cli#readme) - Minifies CSS
- [`highlight.js`](https://highlightjs.org/) - Adds syntax highlighting for code samples
- [`marked`](https://marked.js.org/) - Converts Markdown to HTML
- [`zx`](https://github.com/google/zx#readme) - Excellent helper library from Google for writing shell scripts.

Any of these would be replaceable with a little work, but they're great libraries and should be very ease to keep up to date.

### How to try it.

If you'd like to give it a trial spin simply clone the repo:

```bash
git clone https://github.com/kevinjruffe/kevinruffe.com.git
```

Then install dependencies:

```bash
cd kevinruffe.com_v2 && npm i && npm run compile
```

...and finally create a starter Markdown file with:

```bash
npm run newPost
```

Once you've completed writing your Markdown file all that's needed is running `npm run build` and your blog site will be generated. Viewing it locally is then possible by running `npm run serve`. That's it.

Of course, everything is set up with my own use case in mind. If you'd like to fork this repo to make your own static site you'll need to do some small customization. Namely, you'll want to update the images in the `blog` directory, `rm -rf blog/built` and update the `style.css` file to add your own look. Then you would run through the process of starting a first post as already described.

### The infrastructure the site is served with.

In the past for static sites I've used AWS or [Vercel](https://vercel.com/), and that would have been a great choice for this site too. In fact, for a static site like this any CDN service should work just fine, but for the sake of trying something new I went with [Cloudflare's Pages offering](https://pages.cloudflare.com/).

Setup couldn't be simpler. You do some initial configuration that dictates how Cloudflare gets triggered (in my case, through pushes to my GitHub repository), then you do a small bit of configuration telling Cloudflare how to respond to that trigger:

1. **Choose the framework you're using so Cloudflare knows what to expect.** For me, there is no framework, so we choose "None".
2. **Any command your framework or script needs to build the site**. Here that is `npm run build`, which compiles TypeScript and then triggers the blog generation script. (Yes, I could have just done the later -- my `npm run generate` command -- but I wanted to have Cloudflare respond to any code changes subsequently made to the script code.
3. **The output directory your built files live in.** In this case, those files live at `/blog/built`.

That done you have a site deployed around the world at "the edge". You'll likely want to hook up a custom domain and perhaps leverage some of Cloudflare's other services, but that's really all that is necessary to get going.

### Glossary of `npm` Scripts

- `build` - Runs the `compile` script followed by the `generate` script.
- `compile` - Compiles TypeScript to JavaScript.
- `generate` - Runs the static site generation script.
- `lint` - Runs [ESLint](https://eslint.org/)
- `newPost` - Runs script that asks for a post title, then builds new file using a necessary filename convention. It also adds the title and some special date markup to the Markdown file.
- `prettier` - Runs [Prettier](https://prettier.io/)
- `server` - Runs [http-server](https://github.com/http-party/http-server#readme) with no caching on localhost and your local network.

(Prettier and ESLint are also scripts rather than just a plugin that Visual Studio Code executes because I'm one of those people that still reaches for `vim` by default. 😉)

## Some Future Plans

I'm going to keep a list here of features to add in the future.

- An "About" page.
- I don't feel too strongly about this, but incorporating tagging might be nice so that posts could be grouped by topic, rather than just existing in descending order.
- A login link for family/friends. The idea here would be that family and friends could login to the site and that would unlock additional **private** posts, like posts about, or pictures of, my kid. The current idea for this would be to leverage [Auth0](https://auth0.com/) to handle authorization and [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/platform/functions/) to simply strip the private posts for the non-authorized and serve all others as normal. The latter are middleware-like serverless functions that run at the CDN layer (a.k.a. "the edge") to manipulate HTML on a per-request basis.

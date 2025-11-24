# Admin Panel

A premium dashboard template with a responsive and high-quality UI.

**Developed by STL Product Lab LLC**

## Preview

This admin panel is fully responsive and compatible with all modern browsers. Thanks to its modern and user-friendly design you can create a fully functional interface that users will love!

## Features

* **Responsive:** With support for mobile, tablet and desktop displays, it doesn't matter what device you're using. Works in all major browsers.
* **Cross Browser:** Works perfectly with the latest Chrome, Firefox+, Safari, Opera, Edge and mobile browsers.
* **HTML5 & CSS3:** Built with modern web technologies including subtle CSS3 animations.
* **Clean Code:** Following Bootstrap's guidelines for easy integration. All code is W3C valid.
* **Multiple Pages:** Features over 20 individual pages using various components.

## Installation

### Prerequisites

- Node.js (v18 or higher)
- pnpm package manager

### Setup

1. Clone the repository
2. Install dependencies:
```sh
pnpm install
```

3. Start the development server:
```sh
pnpm run start
```

4. Open [http://localhost:3000](http://localhost:3000) to view the admin panel in your browser.

### Production Build

To create a production build:
```sh
pnpm run build
```

## Docker Support

### Using Docker

1. Build the image:
```sh
docker build -t admin-panel .
```

2. Run the container:
```sh
docker run -p 3000:3000 -p 3001:3001 -v $(pwd)/src:/app/src admin-panel
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Using Docker Compose

```sh
docker compose up --build
```

## Default Theme Settings

The admin panel comes pre-configured with:
- **Primary Color:** Pink
- **Layout:** Vertical sidebar (dark)
- **Font:** Sans-serif
- **Border Radius:** 1

## License

Copyright STL Product Lab LLC. All rights reserved.

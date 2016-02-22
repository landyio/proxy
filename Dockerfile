FROM node:5.6.0
MAINTAINER Dmitry Tsepelev


COPY package.json ./
COPY src /src/
RUN npm install
ENV NODE_ENV="production"
ENV editorJs="https://d2mnlxdd0x11jg.cloudfront.net/editor.min.js"
ENV proxyUrl="https://proxy.landy.io/"
ENV sameOrigin="landy.io"
EXPOSE 80
CMD ["npm", "start"]

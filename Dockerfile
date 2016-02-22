FROM ubuntu
MAINTAINER Dmitry Tsepelev

RUN sudo apt-get update
RUN sudo apt-get install curl
RUN curl -sL https://deb.nodesource.com/setup_5.x | sudo -E bash -
RUN sudo apt-get install -y nodejs
RUN sudo apt-get install -y npm

COPY package.json ./
COPY src /src/
RUN npm install
ENV NODE_ENV="production"
ENV editorJs="https://d2mnlxdd0x11jg.cloudfront.net/editor.min.js"
ENV proxyUrl="https://proxy.landy.io/"
ENV sameOrigin="landy.io"
EXPOSE 80
CMD ["nodejs", "/src/index.js"]

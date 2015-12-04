FROM dtsepelev/base:latest
MAINTAINER Dmitry Tsepelev

COPY src /src/
RUN cd /src; npm install
ENV NODE_ENV="production"
EXPOSE  9000
CMD ["nodejs", "/src/app.js"]
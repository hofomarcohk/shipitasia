# warehouse-service
Viewider Warehouse Service

## Introduction

## Prerequisites
* [nodejs](https://nodejs.org/en) - server
* [docker](https://www.docker.com/) - the scipts are already packaged into docker (TBC)

## Getting Started
First, run the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Development

### Dependency 
* [next.js](https://nextjs.org/) - The framework used
* [npm](https://www.npmjs.com/) - Dependency Management
* [shadcn](https://ui.shadcn.com/) - The ui framework used
* [mongodb](https://www.mongodb.com/) - database
* [redis](https://redis.io/) - cache database

### Architecture

### Database setup
* create migration
```
npx migrate-mongo create migration_name
```

* run migration
```
npx migrate-mongo up
```

### Cronjob
```
npx migrate-mongo up
```

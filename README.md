# deversiFi market making bot
- tests: mocha | chai | nyc
- linting: eslint

## start bot steps
- rename config.example.js -> config.js
- ```npm i```
- ```npm start```

## run tests
- rename config.example.js -> config.js (if you haven't before)
- ```npm i``` (if you haven't before)
- ```npm run test```

## branches
- master -> 4 hour time limit code
- post-improvements -> fixes and changes made after the 4 hour limit

## short description
The bot uses its all assets divded into equal proportions for each order (ask/bid). The proportions will vary when bots orders are re-made (depends entirely on how fast they are filled). Currently the bots 5% order range (from the best value) is limited by the small spread, which highly encumbers it's profitablity.

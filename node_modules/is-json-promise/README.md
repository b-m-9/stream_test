[![Build Status](https://travis-ci.org/abdennour/is-json-promise.svg?branch=master)](https://travis-ci.org/abdennour/is-json-promise)

# Use

```js
import 'is-json-promise';
// or: require('is-json-promise')

String.IsJSON(`iam here`)
   .then((object) => console.info(object))
   .catch((error) => alert('Waww, i cannot be JSON')) ; // promise will run catch
```   
or

```js
import 'is-json-promise';

String.IsJSON(`{"welcome":"Hello"}`)
   .then((object) => console.info(object)) // promise will run "then"
   .catch((error) => alert('Waww, i cannot be JSON')) ;
```

# Safe import :

It will not extend the `String` class with a static method , but it will give you this method as a function :

```js
import {IsJSON} from 'is-json-promise/safe';
//or: const {IsJSON}= require("is-json-promise/safe");

IsJSON(`{"welcome":"Hello"}`)
   .then((object) => console.info(object)) // promise will run "then"
   .catch((error) => alert('Waww, i cannot be JSON')) ;
```

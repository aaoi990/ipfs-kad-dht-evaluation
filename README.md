# ipfs-kad-dht-evaluation

Code used as part of the following paper: https://arxiv.org/abs/2109.08566 

A very simple node program that runs up a series of libp2p nodes, sets a node as a content provider and then confirms that content can be found.

# How to run

Run an npm install in the directory then run:

node index.js

To view debug logs for the DHT process run with:

DEBUG="libp2p:dht*" node index.js

# Performance

The /perf directory holds log examples and flame graph output.

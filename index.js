/* eslint-disable no-console */
'use strict'

const Libp2p = require('libp2p')
const TCP = require('libp2p-tcp')
const uint8ArrayFromString = require('uint8arrays/from-string')
const Mplex = require('libp2p-mplex')
const PeerId = require('peer-id')
const {
  NOISE
} = require('libp2p-noise')
const crypto = require('crypto')
const CID = require('cids')
const multihash = require('multihashes')
const KadDHT = require('libp2p-kad-dht')
const utils = require('libp2p-kad-dht/src/utils')
const delay = require('delay')
const distance = require('xor-distance')
const all = require('it-all')

/**
 * Parse the CID and provider peer id from the key
 *
 * @param {import('interface-datastore').Key} key
 */
 function parseProviderKey (key) {
  const parts = key.toString().split('/')
  if (parts.length !== 4) {
    throw new Error('incorrectly formatted provider entry key in datastore: ' + key)
  }

  return {
    cid: parts[2],
    peerId: parts[3]
  }
}

/**
  * Creates an instance of  Libp2p node with 
  * DHT enabled.  
  * @returns {node}  
  */
const createNode = async () => {
  const node = await Libp2p.create({
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/0']
    },
    modules: {
      transport: [TCP],
      streamMuxer: [Mplex],
      connEncryption: [NOISE],
      dht: KadDHT,
    },
    config: {
      dht: {
        kBucketSize: 20,
        enabled: true,
        randomWalk: {
          enabled: true,
          interval: 300e3,
          timeout: 10e3
        }
      }
    }
  })
  await node.start()
  return node
}

/**
  * Creates a correctly formatted CID from
  * provided input. The CID is a v0 base 58-encoded 
  * multihash (Sha2-256).
  *
  * @param {string} content - content to be formatted
  * @returns {CID} cid
  */

const create_CID = (content) => {
  const hash = crypto.createHash('sha256').update(content).digest()
  const encoded = multihash.encode(hash, 'sha2-256')
  const cid = new CID(multihash.toB58String(encoded))
  return cid
}

/**
  * Takes an array of libp2p nodes and returns the
  * friendly array of peerID in B58String format
  * and ad PeerId
  *
  * @param {Array<Libp2p>} nodes
  * @returns {Array<string>} node_mappings - friendly names 
  * @returns {Array<PeerId>} node_peerIds - in full PeerId format
  */

const map_nodes_to_peerids = (nodes) => {
  let node_mappings = []
  let node_peerIds = []
  nodes.forEach((node) => {
    node_mappings.push(node.peerId.toB58String())
    node_peerIds.push(node.peerId)
  })
  return {
    node_mappings,
    node_peerIds
  }
}

/**
  * Takes an array of peerIds and a query, 
  * uses the built in DHT closest peer function
  * to determins which peers are closest to
  * the provided target.
  *
  * @param {Array<Libp2p>} peers 
  * @param {string} query - in string format, is converted to uint8
  * within the function. 
  * @returns {Array<string>}
  * @returns {Array<PeerId>}
  */

const sort_closest_nodes_dht = async (peers, query) => {
  let query_key = uint8ArrayFromString(query)
  let sorted_peers = await peers[0]._dht.getClosestPeers(query_key)
  let closest_peers = []
  for await (let sorted of sorted_peers) {
    let peer = peers.findIndex(element => element.peerId.toB58String() == sorted._idB58String)
    closest_peers.push(peer)
  }
  return closest_peers
}

;
(async () => {
  const	nodes = []
  for (let index = 0; index < 40; index++) {
    nodes.push(await createNode())
  }

  for (let index = 0; index < nodes.length - 1; index++) {
    nodes[index].peerStore.addressBook.set(nodes[index + 1].peerId, nodes[index + 1].multiaddrs)
  }


  const {
    node_mappings,
    node_peerIds
  } = map_nodes_to_peerids(nodes)

  console.log('Current node addresses: ', node_mappings)

  // Wait for onConnect handlers in the DHT
  await delay(10000)

  const last_node = nodes.length - 1 
  const cid = create_CID("hello world!")
  await nodes[last_node].contentRouting.provide(cid)

  console.log('Node %s: %s is providing content %s', nodes.length, nodes[last_node].peerId.toB58String(), cid.toBaseEncodedString())

  const dhtnodes = await sort_closest_nodes_dht(nodes, 'hello world!')
  console.log('\nClosest nodes to the provided content based on the DHT:', dhtnodes.length)
  for (let index = 0; index < dhtnodes.length; index++) {
    console.log("Node ", dhtnodes[index] + " : " + node_mappings[dhtnodes[index]])
    let data = Object.keys(nodes[dhtnodes[index]]._dht.providers.datastore['data'])
    if(data) {
      data.forEach((item) => {
        let peer_b32 = parseProviderKey(item).peerId
        let peer_raw = utils.decodeBase32(peer_b32)
        let id = PeerId.createFromBytes(peer_raw)
        console.log("\tDatastore entry:", id.toB58String())
      })
    }
  }

  const providers = await all(nodes[0].contentRouting.findProviders(cid))

  console.log('\n Node 0 Found provider:', providers[0].id.toB58String(), providers)

  nodes.forEach((node) => {
    node.stop()
  })
})();

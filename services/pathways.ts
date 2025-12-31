import {
  BlobReader,
  BlobWriter,
} from '@zip.js/zip.js'

import { parseCsv } from '~/util/csv'
import { createEmptyGtfsDataset, createGtfsArchive } from '~/util/gtfs'
import * as xml from '~/util/xml'

const CHANGESET_FILE = 'changeset'

const PATHWAYS_FILES = new Set([
  'levels.txt',
  'pathways.txt',
  'stops.txt',
])

export async function openTdeiPathwaysArchive(
  zip: Blob,
  parseObjects: boolean = true,
  filterPathways: boolean = true,
) {
  const blobReader = new BlobReader(zip)
  const zipReader = new ZipReader(blobReader)
  let entries = await zipReader.getEntries()

  // if we are opening a TDEI archive then entries are zipped up,
  // otherwise the legacy Workspaces archive has everything in a single directory
  for (const x of entries) {
    if (!x.filename.startsWith(CHANGESET_FILE) && x.filename.endsWith('.zip')) {
      const subzipBlob = await x.getData(new BlobWriter())
      const subzipFileReader = new BlobReader(subzipBlob)
      const subzipReader = new ZipReader(subzipFileReader)
      entries = await subzipReader.getEntries()
      break
    }
  }

  const filePromises = []

  for (const e of entries) {
    if (!filterPathways || PATHWAYS_FILES.has(e.filename)) {
      const textWriter = new TextWriter()

      filePromises.push(new Promise((resolve) => {
        const csv = e.getData(textWriter)

        if (parseObjects) {
          resolve([e.filename, parseCsv(csv)])
        }
        else {
          resolve([e.filename, csv])
        }
      }))
    }
  }

  const map = new Map(await Promise.all(filePromises))

  return map
}

export function pathways2osc(changesetId: number, dataset) {
  const oscDoc = xml.parse(
    '<osmChange version="0.6"><create /><modify /><delete /></osmChange>',
    'application/xml',
  )
  const createNode = oscDoc.firstChild.firstChild
  const stopNodeIdMap = new Map()
  let currentId = -1

  for (const stop of dataset.get('stops.txt') ?? []) {
    const node = xml.makeNode(oscDoc, 'node', {
      id: currentId,
      changeset: changesetId,
      version: 1,
      lat: stop.stop_lat.trim(),
      lon: stop.stop_lon.trim(),
    })

    for (const [k, v] of Object.entries(stop)) {
      if (k !== 'stop_lat' && k !== 'stop_lon') {
        node.appendChild(xml.makeNode(oscDoc, 'tag', { k, v }))
      }
    }

    stopNodeIdMap.set(stop.stop_id, currentId)
    createNode.appendChild(node)
    currentId--
  }

  for (const pathway of dataset.get('pathways.txt') ?? []) {
    const way = xml.makeNode(oscDoc, 'way', {
      id: currentId,
      changeset: changesetId,
      version: 1,
    })

    way.appendChild(xml.makeNode(oscDoc, 'nd', {
      ref: stopNodeIdMap.get(pathway.from_stop_id),
    }))
    way.appendChild(xml.makeNode(oscDoc, 'nd', {
      ref: stopNodeIdMap.get(pathway.to_stop_id),
    }))

    for (const [k, v] of Object.entries(pathway)) {
      way.appendChild(xml.makeNode(oscDoc, 'tag', { k, v }))
    }

    createNode.appendChild(way)
    currentId--
  }

  return xml.serialize(oscDoc)
}

function makeStopColumnMap() {
  const map = new Map([
    ['stop_id', ''],
    ['stop_name', ''],
    ['stop_lat', ''],
    ['stop_lon', ''],
    ['location_type', ''],
  ])

  map.reset = () => {
    map.forEach((val, key) => { map.set(key, '') })
  }

  return map
}

function makePathwayColumnMap() {
  const map = new Map([
    ['pathway_id', ''],
    ['from_stop_id', ''],
    ['to_stop_id', ''],
    ['pathway_mode', ''],
    ['is_bidirectional', ''],
  ])

  map.reset = () => {
    map.forEach((val, key) => { map.set(key, '') })
  }

  return map
}

export async function buildPathwaysCsvArchive(elements, gtfsFiles: Map): Blob {
  if (!gtfsFiles) {
    gtfsFiles = createEmptyGtfsDataset()
  }

  let stopsCsv = 'stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,level_id\n'
  let pathwaysCsv = 'pathway_id,from_stop_id,to_stop_id,pathway_mode,is_bidirectional\n'

  const stopNodeIdMap = new Map()
  const stopColumnMap = makeStopColumnMap()
  const pathwayColumnMap = makePathwayColumnMap()

  for (const element of elements) {
    if (element.type === 'node') {
      stopColumnMap.reset()
      stopColumnMap.set('stop_id', element.tags.stop_id)
      stopColumnMap.set('stop_lat', element.lat)
      stopColumnMap.set('stop_lon', element.lon)
      stopColumnMap.set('stop_name', element.tags.stop_name)
      stopColumnMap.set('location_type', element.tags.location_type)
      stopColumnMap.set('parent_station', element.tags.parent_station)
      stopColumnMap.set('level_id', element.tags.level_id)

      stopsCsv += Array.from(stopColumnMap.values()).join(',')
      stopsCsv += '\n'
      stopNodeIdMap.set(element.id, element.tags.stop_id)
    }
    else {
      pathwayColumnMap.reset()
      pathwayColumnMap.set('pathway_id', element.tags.pathway_id)
      pathwayColumnMap.set('from_stop_id', stopNodeIdMap.get(element.nodes[0]))
      pathwayColumnMap.set('to_stop_id', stopNodeIdMap.get(element.nodes[1]))
      pathwayColumnMap.set('pathway_mode', element.tags.pathway_mode)
      pathwayColumnMap.set('is_bidirectional', element.tags.is_bidirectional)

      pathwaysCsv += Array.from(pathwayColumnMap.values()).join(',')
      pathwaysCsv += '\n'
    }
  }

  gtfsFiles.set('pathways.txt', pathwaysCsv)
  gtfsFiles.set('stops.txt', stopsCsv)

  return await createGtfsArchive(gtfsFiles)
}

export class PathwaysEditorManager {
  #baseUrl: string
  #osmUrl: string
  #tdeiAuth: TdeiAuthStore

  constructor(baseUrl: string, osmUrl: string, tdeiAuth: TdeiAuthStore) {
    this.#baseUrl = baseUrl
    this.#osmUrl = osmUrl.replace(/\/+$/, '')
    this.#tdeiAuth = tdeiAuth

    this.loaded = ref(false)
    this.containerNode = document.createElement('div')
    this.editorContext = null
  }

  load() {
    if (this.loaded.value) {
      return
    }

    const style = document.createElement('link')
    style.setAttribute('href', this.#baseUrl + 'iD.css')
    style.setAttribute('type', 'text/css')
    style.setAttribute('rel', 'stylesheet')
    document.head.appendChild(style)

    const script = document.createElement('script')
    script.src = this.#baseUrl + 'iD.js'
    script.async = true
    script.onload = this.#onLoaded.bind(this)
    document.body.appendChild(script)
  }

  init(workspaceId: number) {
    const osmConnection = { url: this.#osmUrl, apiUrl: this.#osmUrl }

    this.editorContext.workspaceId = workspaceId
    this.editorContext.connection().apiConnections([osmConnection])
    this.editorContext.init()
    this.editorContext.connection().switch(osmConnection)
    this.#patchEditor()

    return Promise.resolve()
  }

  switchWorkspace(workspaceId: number) {
    this.editorContext.workspaceId = workspaceId

    // Induce the editor to re-read the configuration from the URL hash:
    window.dispatchEvent(new HashChangeEvent('hashchange', {
      newUrl: window.location.href,
      oldUrl: window.location.href,
    }))

    this.editorContext.reset()

    return Promise.resolve()
  }

  #onLoaded() {
    this.loaded.value = true

    this.editorContext = window.iD.coreContext()
    this.editorContext.embed(true)
    this.editorContext.containerNode(this.containerNode)
    this.editorContext.assetPath(this.#baseUrl)
    this.editorContext.setsDocumentTitle(false)

    console.info('Pathways editor loaded', window.iD)
  }

  #patchEditor() {
    const pathwaysOsmService = this.editorContext.connection()
    const pathwaysOsmClient = pathwaysOsmService.oauthClient

    pathwaysOsmClient.xhr = this.#wrapXhr(pathwaysOsmClient.xhr)
    pathwaysOsmClient.authenticated = () => this.#tdeiAuth.ok

    // Don't bother to fetch user details when uploading changesets:
    pathwaysOsmService.userDetails = (callback) => { callback('dummy error') }
  }

  #wrapXhr(innerXhr) {
    return (options, callback) => {
      if (!options.headers) {
        options.headers = {}
      }

      const tokenHeader = 'Bearer ' + this.#tdeiAuth.accessToken

      if (options.headers instanceof Headers) {
        options.headers.set('X-Workspace', this.editorContext.workspaceId)
        options.headers.set('Authorization', tokenHeader)
      }
      else if (Array.isArray(options.headers)) {
        options.headers.push(['X-Workspace', this.editorContext.workspaceId])
        options.headers.push('Authorization', tokenHeader)
      }
      else {
        options.headers['X-Workspace'] = this.editorContext.workspaceId

        // Don't let osm-auth overwrite our auth header:
        Object.defineProperty(options.headers, 'Authorization', {
          value: tokenHeader,
          writable: false,
          enumerable: true,
        })
      }

      return innerXhr(options, callback)
    }
  }
}

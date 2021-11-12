/**
 *
 *    Copyright (c) 2021 Silicon Labs
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 *
 *
 * @jest-environment node
 */

const dbApi = require('../src-electron/db/db-api.js')
const zclLoader = require('../src-electron/zcl/zcl-loader.js')
const env = require('../src-electron/util/env.ts')
const testUtil = require('./test-util.js')
const querySession = require('../src-electron/db/query-session.js')
const queryPackage = require('../src-electron/db/query-package.js')
const util = require('../src-electron/util/util.js')
let db
let sid
let mfgCode = 0xbead
let customPackageId

beforeAll(async () => {
  env.setDevelopmentEnv()
  let file = env.sqliteTestFile('custom-cluster')
  db = await dbApi.initDatabaseAndLoadSchema(
    file,
    env.schemaFile(),
    env.zapVersion()
  )
  await zclLoader.loadZcl(db, env.builtinSilabsZclMetafile())
  let userSession = await querySession.ensureZapUserAndSession(
    db,
    'USER',
    'SESSION'
  )
  sid = userSession.sessionId
  return util.initializeSessionPackage(db, sid, {
    zcl: env.builtinSilabsZclMetafile(),
    template: env.builtinTemplateMetafile(),
  })
}, testUtil.timeout.medium())

afterAll(() => dbApi.closeDatabase(db), testUtil.timeout.short())

test('Test initial state of load', async () => {
  x = await dbApi.dbAll(
    db,
    'SELECT * FROM CLUSTER WHERE MANUFACTURER_CODE = ?',
    [mfgCode]
  )
  expect(x.length).toEqual(0)

  x = await dbApi.dbAll(
    db,
    'SELECT * FROM ATTRIBUTE WHERE MANUFACTURER_CODE = ?',
    [mfgCode]
  )
  expect(x.length).toEqual(0)

  x = await dbApi.dbAll(
    db,
    'SELECT * FROM COMMAND WHERE MANUFACTURER_CODE = ?',
    [mfgCode]
  )
  expect(x.length).toEqual(0)
})

test('Load custom file and insert a package into the session', async () => {
  let result = await zclLoader.loadIndividualFile(
    db,
    testUtil.customClusterXml,
    sid
  )
  expect(result.succeeded).toBeTruthy()
  expect(result.packageId).not.toBeNull()
  expect(result.packageId).not.toBeUndefined()

  customPackageId = result.packageId
  await queryPackage.insertSessionPackage(db, sid, result.packageId, false)
})

test(
  'Validate custom load and multiple packages in a session',
  async () => {
    x = await dbApi.dbAll(
      db,
      'SELECT * FROM CLUSTER WHERE MANUFACTURER_CODE = ?',
      [mfgCode]
    )
    expect(x.length).toEqual(1)

    x = await dbApi.dbAll(
      db,
      'SELECT * FROM ATTRIBUTE WHERE MANUFACTURER_CODE = ?',
      [mfgCode]
    )
    expect(x.length).toEqual(2)

    x = await dbApi.dbAll(
      db,
      'SELECT * FROM COMMAND WHERE MANUFACTURER_CODE = ?',
      [mfgCode]
    )
    expect(x.length).toEqual(1)

    x = await queryPackage.getSessionPackages(db, sid)
    expect(x.length).toEqual(2)
    expect(
      x[0].packageRef == customPackageId || x[1].packageRef == customPackageId
    ).toBeTruthy()
  },
  testUtil.timeout.medium()
)

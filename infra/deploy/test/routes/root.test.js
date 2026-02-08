'use strict'

const { build } = require('../helper')

describe('Root Route', () => {
  let app

  beforeAll(async () => {
    app = await build()
  })

  afterAll(async () => {
    await app.close()
  })

  test('should return root response', async () => {
    const res = await app.inject({
      url: '/'
    })
    
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ root: true })
  })
})

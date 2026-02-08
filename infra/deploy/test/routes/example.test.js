'use strict'

const { build } = require('../helper')

describe('Example Route', () => {
  let app

  beforeAll(async () => {
    app = await build()
  })

  afterAll(async () => {
    await app.close()
  })

  test('should return example response', async () => {
    const res = await app.inject({
      url: '/example'
    })
    
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('this is an example')
  })
})

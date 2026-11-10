import express from "express"
import * as dotenv from 'dotenv'
import cors from 'cors'

import dalleRoutes from './routes/dalle.routes.js'

dotenv.config()

const app =  express()
app.use(cors())
app.use(express.json({ limit: "50mb" }))

app.use('/api/v1/dalle', dalleRoutes)

app.get('/',(req,res) =>{
    res.status(200).json({ message: "Hi from DALL.E" })
})

const port = process.env.PORT || 8080

app.listen(port, "0.0.0.0", () => console.log(`Server started on port ${port}`))
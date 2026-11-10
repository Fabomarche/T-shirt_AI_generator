import express from 'express'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

const router = express.Router()

// Pollinations Classic image API: free, no account, no API key, no card.
// Docs: https://github.com/pollinations/pollinations/blob/master/APIDOCS.md
const IMAGE_ENDPOINT = 'https://image.pollinations.ai/prompt/'
const IMAGE_SIZE = 512
const REQUEST_TIMEOUT_MS = 55_000
const MAX_PROMPT_LENGTH = 500
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

router.route('/').get((req, res) => {
    res.status(200).json({ message: 'Hello from DALL.E ROUTES' })
})

router.route('/').post(async (req, res) => {
    try {
        const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : ''

        if (!prompt) {
            return res.status(400).json({ message: 'Please enter a prompt.' })
        }

        if (prompt.length > MAX_PROMPT_LENGTH) {
            return res.status(400).json({
                message: `Prompt is too long. Use at most ${MAX_PROMPT_LENGTH} characters.`,
            })
        }

        const imageResponse = await fetch(buildImageUrl(prompt), {
            method: 'GET',
            headers: { Accept: 'image/jpeg, image/png' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })

        if (imageResponse.status === 402) {
            return res.status(429).json({
                message: `The free image service allows one image at a time. ${retryHint(imageResponse.headers.get('retry-after'))}`,
            })
        }

        const contentType = imageResponse.headers.get('content-type') || ''
        if (!imageResponse.ok || !contentType.startsWith('image/')) {
            console.log(`Image provider error: status ${imageResponse.status}, content-type ${contentType || 'unknown'}`)
            return res.status(502).json({
                message: 'Could not generate an image. Try a different prompt or try again in a moment.',
            })
        }

        const buffer = Buffer.from(await imageResponse.arrayBuffer())
        if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
            console.log(`Image provider returned an unexpected payload size: ${buffer.length}`)
            return res.status(502).json({
                message: 'The image service returned an invalid image. Try again.',
            })
        }

        const photo = toPngBase64(buffer, contentType)

        return res.status(200).json({ photo })
    } catch (error) {
        const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
        console.log(timedOut ? 'Image provider request timed out' : `Image generation failed: ${error?.message || error}`)
        return res.status(timedOut ? 504 : 500).json({
            message: timedOut
                ? 'The image service took too long. Try again.'
                : 'Could not generate an image. Try again.',
        })
    }
})

function buildImageUrl(prompt) {
    const seed = Math.floor(Math.random() * 1_000_000_000)
    const params = new URLSearchParams({
        width: String(IMAGE_SIZE),
        height: String(IMAGE_SIZE),
        seed: String(seed),
        safe: 'true',
    })

    return `${IMAGE_ENDPOINT}${encodeURIComponent(prompt)}?${params.toString()}`
}

function retryHint(retryAfterHeader) {
    const seconds = Number.parseInt(retryAfterHeader, 10)
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) {
        return 'Wait about 45 seconds and try again.'
    }

    return `Wait ${seconds} seconds and try again.`
}

function toPngBase64(buffer, contentType) {
    if (contentType.includes('png') && isPng(buffer)) {
        return buffer.toString('base64')
    }

    if (!isJpeg(buffer)) {
        throw new Error('Provider response is not a JPEG or PNG image')
    }

    const decoded = jpeg.decode(buffer, {
        useTArray: true,
        formatAsRGBA: true,
        maxResolutionInMP: 2,
    })

    if (!decoded?.width || !decoded?.height || !decoded?.data) {
        throw new Error('Could not decode the generated image')
    }

    if (decoded.width > 1024 || decoded.height > 1024) {
        throw new Error('Generated image is larger than expected')
    }

    const png = new PNG({ width: decoded.width, height: decoded.height })
    png.data = Buffer.from(decoded.data)

    return PNG.sync.write(png).toString('base64')
}

function isJpeg(buffer) {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
}

function isPng(buffer) {
    return buffer.length >= 8
        && buffer[0] === 0x89
        && buffer[1] === 0x50
        && buffer[2] === 0x4e
        && buffer[3] === 0x47
}

export default router

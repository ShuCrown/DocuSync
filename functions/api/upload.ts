interface Env {
  FILES_BUCKET: R2Bucket
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const formData = await context.request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return Response.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Generate a unique key
    const ext = file.name.split('.').pop() ?? 'bin'
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    // Upload to R2
    await context.env.FILES_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        originalName: file.name,
      },
    })

    return Response.json({ key, name: file.name })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    )
  }
}

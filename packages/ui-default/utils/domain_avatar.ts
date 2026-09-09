const MAX_UPLOAD_SIZE = 8 * 1024 * 1024;

export async function prepareDomainAvatar(file: File): Promise<Blob> {
  if (!file || !file.size) throw new Error('请选择一张图片。');
  if (file.size > MAX_UPLOAD_SIZE) throw new Error('图片不能超过 8 MB，请选择较小的图片。');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片。');
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  try {
    image.src = objectUrl;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) {
      throw new Error('图片尺寸过大，请选择小一些的图片。');
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器暂时无法处理图片，请刷新后重试。');
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 512, 512);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('图片处理失败，请换一张图片重试。'));
    }, 'image/png'));
  } catch (error) {
    if (error.name === 'EncodingError') throw new Error('无法读取这张图片，请选择完整有效的图片。');
    throw error;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

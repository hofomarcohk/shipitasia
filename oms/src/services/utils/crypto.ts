import crypto from 'crypto';

// 加密函數
export const encrypt = (text: string) => {
  const secret = process.env.API_SECRET || '';
  const iv = crypto.randomBytes(16); // 隨機生成初始化向量
  const cipher = crypto.createCipheriv('aes-256-cbc', secret, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted; // 返回 iv 和加密後的內容
};

// 解密函數
export const decrypt = (encryptedText: string) => {
  const secret = process.env.API_SECRET || '';
  const parts = encryptedText.split(':');
  const ivPart = parts.shift();
  if (!ivPart) {
    throw new Error('Invalid encrypted text');
  }
  const iv = Buffer.from(ivPart, 'hex'); // 取得 iv
  const encryptedTextBuffer = Buffer.from(parts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(secret), iv);
  let decrypted = decipher.update(encryptedTextBuffer.toString('hex'), 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

// Generate a random 6-character code
export function generateAttendanceCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate a unique class code
export function generateClassCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate 4 options with one correct code
export function generateAttendanceOptions(correctCode: string): string[] {
  const options = [correctCode];
  
  // Generate 3 random incorrect options
  while (options.length < 4) {
    const randomCode = generateAttendanceCode();
    if (!options.includes(randomCode)) {
      options.push(randomCode);
    }
  }
  
  // Shuffle the array
  return options.sort(() => Math.random() - 0.5);
}

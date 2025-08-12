import { auth, provider, signInWithPopup } from "../firebase";

export default function LoginButton() {
  const handleLogin = async () => {
    try {
      // 🔐 Always show Google account picker to prevent auto-login into previous account
      provider.setCustomParameters({
        prompt: 'select_account',
      });

      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const token = await user.getIdToken();

      console.log("✅ Logged in:", user.email);
      console.log("🔑 Token:", token);

      localStorage.setItem("user", JSON.stringify({
        uid: user.uid,
        email: user.email,
        name: user.displayName,
        photo: user.photoURL,
      }));
    } catch (err) {
      console.error("❌ Login failed:", err);
    }
  };

  return (
    <button
      onClick={handleLogin}
      className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition mb-6"
    >
      🔐 Sign in with Google
    </button>
  );
}

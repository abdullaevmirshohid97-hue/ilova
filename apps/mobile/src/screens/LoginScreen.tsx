import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { phoneToEmail, supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(phone),
      password,
    });
    setLoading(false);
    if (err) {
      setError('Telefon yoki parol noto`g`ri');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>ILOVA B2B</Text>
        <Text style={styles.subtitle}>Ulgurji savdo tizimi</Text>

        <Text style={styles.label}>Telefon raqam</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoCapitalize="none"
          placeholder="+998 90 123 45 67"
          placeholderTextColor="#B9BDCC"
        />

        <Text style={styles.label}>Parol</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Parolingiz"
          placeholderTextColor="#B9BDCC"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading || password.length === 0}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Kirish</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.hint}>
          Akkaunt olish uchun do`kon administratoriga murojaat qiling
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F3F7',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
  },
  logo: {
    color: '#7000FF',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 2,
  },
  subtitle: {
    color: '#8E92A3',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 28,
  },
  label: {
    color: '#8E92A3',
    fontSize: 13,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F2F3F7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9EAF2',
    color: '#14151A',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: {
    color: '#f87171',
    marginTop: 12,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#7000FF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: {
    color: '#B9BDCC',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
  },
});

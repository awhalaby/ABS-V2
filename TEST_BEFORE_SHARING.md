# Self-Testing Guide - Test Before Sharing with Others

Use this checklist to test network access **yourself** before asking others to test.

## ✅ Testing Checklist

### Phase 1: Quick Localhost Test (Baseline)

Test on your own computer first to make sure the app works:

```bash
# 1. Start the app
docker-compose up

# 2. Open browser to:
http://localhost:5173

# 3. Test these features:
```

- [ ] Page loads without errors
- [ ] Can upload order file
- [ ] Can view velocity data
- [ ] Can generate forecast
- [ ] Can create schedule
- [ ] Simulation runs and updates

**If Phase 1 fails:** Fix the app first before testing network access!

---

### Phase 2: Test with Your IP (Simulates Remote Access)

**On your own computer**, use your IP address instead of localhost:

```bash
# 1. Get your IP
ipconfig getifaddr en0
# Example: 10.1.10.112

# 2. Open browser to YOUR IP:
http://10.1.10.112:5173  # Use your actual IP

# 3. Test the same features again:
```

- [ ] Page loads without errors
- [ ] Can upload order file (THIS IS KEY!)
- [ ] Can view velocity data
- [ ] Can generate forecast
- [ ] Can create schedule
- [ ] Simulation updates in real-time
- [ ] No console errors (press F12 to check)

**Check browser console (F12 → Console tab):**

- [ ] No errors about "localhost"
- [ ] No CORS errors
- [ ] No "identifier" or "resource" errors
- [ ] API calls go to `http://10.1.10.112:3001` (not localhost)

**If Phase 2 fails:** Your network configuration needs fixing!

---

### Phase 3: Test with Your Phone (True Remote Test) ⭐ BEST TEST

**This is the real test** - exactly like accessing from another computer!

1. **Connect phone to the same WiFi as your computer**

2. **Open phone browser and go to:**

   ```
   http://10.1.10.112:5173  # Use your actual IP
   ```

3. **Test everything:**
   - [ ] Page loads
   - [ ] Navigation works (go to different pages)
   - [ ] Can upload order file (may need small test file)
   - [ ] Can view data
   - [ ] Can generate forecast
   - [ ] Simulation works

**If Phase 3 passes:** ✅ It will work for your boss!

**If Phase 3 fails:** See troubleshooting below.

---

### Phase 4: Test with Incognito/Private Browser

Tests without browser cache:

```bash
# 1. Open Incognito/Private window

# 2. Go to:
http://10.1.10.112:5173  # Use your actual IP

# 3. Test features
```

- [ ] Everything works in Incognito mode

---

## 🐛 Common Issues & Fixes

### Issue: Page loads on phone but file upload fails

**Symptom:** Can see the app but uploads don't work

**Fix:**

```bash
# Rebuild frontend
docker-compose down
docker-compose build --no-cache frontend
docker-compose up

# Clear phone browser cache or use private browsing
```

---

### Issue: Can't connect from phone at all

**Symptoms:**

- Page won't load
- "Site can't be reached"
- Timeout

**Fixes:**

1. **Check you're on the same WiFi:**

   - Phone and computer must be on SAME network
   - Not guest WiFi
   - Not mobile data

2. **Check firewall:**

   ```bash
   # Mac: System Settings → Network → Firewall
   # Make sure Node/Docker is allowed
   ```

3. **Test connection:**

   ```bash
   # From phone browser, try:
   http://10.1.10.112:3001/health

   # Should show: {"status":"ok",...}
   ```

4. **Verify IP hasn't changed:**
   ```bash
   ipconfig getifaddr en0
   # If different than docker-compose.yml, update and restart
   ```

---

### Issue: Console shows errors about "localhost"

**Symptom:** Network tab shows requests to `localhost:3001`

**Fix:** Frontend wasn't rebuilt properly

```bash
docker-compose down
docker-compose build --no-cache frontend
docker-compose up
```

---

### Issue: CORS errors in console

**Symptom:** Console shows "CORS policy blocked"

**Fix:** Already configured, but check backend logs:

```bash
docker-compose logs backend | grep -i cors
```

---

## 🧪 Testing Scripts

### Quick Test Script

Save as `quick-test.sh`:

```bash
#!/bin/bash

echo "🧪 Quick Network Test"
echo "===================="
echo ""

# Get IP
MY_IP=$(ipconfig getifaddr en0)
echo "📍 Your IP: $MY_IP"
echo ""

# Check if docker-compose has correct IP
echo "⚙️  Checking docker-compose.yml..."
grep "VITE_API_URL" docker-compose.yml
echo ""

# Check containers
echo "🐳 Container Status:"
docker-compose ps
echo ""

# Test backend health
echo "🏥 Testing backend health..."
curl -s http://$MY_IP:3001/health && echo "" || echo "❌ Backend not responding"
echo ""

# Test frontend
echo "🌐 Testing frontend..."
curl -s -o /dev/null -w "%{http_code}" http://$MY_IP:5173 && echo " - Frontend is responding" || echo "❌ Frontend not responding"
echo ""

echo "===================="
echo "✅ Quick test complete!"
echo ""
echo "🧪 Manual tests:"
echo "1. Open browser: http://$MY_IP:5173"
echo "2. Test on phone: http://$MY_IP:5173"
echo ""
echo "📱 Phone troubleshooting:"
echo "- Make sure phone is on same WiFi"
echo "- Try in phone's private browsing mode"
```

Run it:

```bash
chmod +x quick-test.sh
./quick-test.sh
```

---

## 📱 Phone Testing Tips

### iPhone:

- Use Safari or Chrome
- Clear Safari cache: Settings → Safari → Clear History and Website Data
- Or use Private Browsing

### Android:

- Use Chrome
- Clear Chrome cache: Chrome → Settings → Privacy → Clear browsing data
- Or use Incognito mode

### Both:

- **Make sure WiFi is connected** (not mobile data)
- If your WiFi name shows "5G", connect to the regular one instead
- Try disabling and re-enabling WiFi

---

## 🎯 The "I'm Confident" Checklist

Before telling your boss "it's ready":

- [ ] ✅ Works on localhost (Phase 1)
- [ ] ✅ Works with your IP on your computer (Phase 2)
- [ ] ✅ Works on your phone (Phase 3)
- [ ] ✅ No console errors (F12)
- [ ] ✅ File uploads work on phone
- [ ] ✅ Simulation updates work on phone
- [ ] ✅ IP address in docker-compose.yml is correct
- [ ] ✅ Containers are running: `docker-compose ps`
- [ ] ✅ Backend health check works: `curl http://YOUR_IP:3001/health`

**If all checked:** 🎉 You're good to go!

---

## 💡 Pro Tips

1. **Keep your test file small**
   - Use a small orders JSON file for phone testing (easier to upload)
2. **Use browser DevTools**

   - Press F12 → Network tab
   - Watch API requests - they should go to your IP, not localhost

3. **Create a test account/data**

   - Have a small test dataset ready
   - Faster to test features

4. **Take screenshots**

   - If it works on your phone, take screenshots
   - Show your boss it's tested!

5. **Document the URL**
   - Write down: `http://10.1.10.112:5173`
   - Share with your boss

---

## 🚨 Emergency "It's Not Working" Checklist

If your boss reports issues:

1. **Ask for screenshot of error**
2. **Ask them to try phone first** (rules out their computer)
3. **Check if your IP changed:**
   ```bash
   ipconfig getifaddr en0
   ```
4. **Check containers are running:**
   ```bash
   docker-compose ps
   ```
5. **Check logs for errors:**
   ```bash
   docker-compose logs backend | tail -50
   ```
6. **Nuclear option - rebuild everything:**
   ```bash
   ./fix-and-restart.sh
   ```

---

## 📊 Success Metrics

You'll know it's working when:

- ✅ Phone loads the page instantly
- ✅ Can navigate between all pages
- ✅ File upload works (progress bar moves, success message)
- ✅ Data displays correctly
- ✅ No error messages anywhere
- ✅ Simulation updates smoothly

**Then you can confidently share with your boss!**
